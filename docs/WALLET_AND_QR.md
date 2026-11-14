# Dyce — Wallet, Pools and QR money

Dyce Cash is **virtual**. It can't be bought, withdrawn or exchanged. Every screen that shows a balance includes or links to that line.

## 1. Units and display
- Store and compute in **kobo** (`bigint`). ₦1 = 100 kobo. Starting grant = ₦200,000 = 20,000,000 kobo.
- `formatNaira(kobo, { compact })` in `packages/shared/format.ts`:
  - compact (balances in pills, tab headers, wallet card, cards in lists): `₦200k`, `₦1.2m`, `₦12.5k`, `₦950`. Rule: < ₦10,000 → full with thousands separator (`₦1,500`); ≥ ₦10,000 → `k` with one decimal dropped when zero (`₦12.5k`, `₦200k`); ≥ ₦1,000,000 → `m`.
  - full (receipts, confirm sheets, history detail): `₦200,000`.
- Amount entry: numeric keypad, whole naira only, presets, max shown.

## 2. Ledger (double entry)
Tables:
- `ledger_accounts(id, kind enum(user_wallet, pool_escrow, system_grant, system_topup, system_adjust), owner_user uuid null, match_id uuid null, created_at)`
- `ledger_txns(id, kind enum(grant, topup, transfer, request_payment, stake, payout, refund, reversal, adjust), idempotency_key text unique, actor_user uuid, meta jsonb, created_at)`
- `ledger_entries(id, txn_id, account_id, amount_kobo bigint, created_at)` — signed; entries of a txn sum to 0.
- `wallets(user_id pk, account_id, balance_kobo bigint check (balance_kobo >= 0), updated_at)` — cached balance updated in the same transaction.
- `daily_usage(user_id, day date, pool_games int, pool_staked_kobo bigint, sent_kobo bigint)`

All movement goes through `SECURITY DEFINER` functions that lock wallet rows in a consistent order (`ORDER BY user_id`, `FOR UPDATE`), check limits, insert txn + entries, update cached balances, and are idempotent on `idempotency_key` (same key returns the original txn). Functions:
- `grant_welcome(user)` — once per user (unique partial index), from `system_grant`.
- `transfer(from, to, amount, note, idem)` — friend-to-friend send.
- `create_payment_request(...)`, `pay_payment_request(request_id, idem)` — see §4.
- `stake_pool(match_id, user, amount, idem)` → moves to the match's `pool_escrow` account.
- `settle_match(match_id)` — computes payouts from the engine result + payout scheme; escrow → winners; rounding remainder goes to the first-placed player; draws refund; writes `match_players.payout_kobo`.
- `refund_match(match_id, reason)` — expired invites, cancelled spaces, host-closed spaces.
- `reverse_txn(txn_id, reason)` — admin only, for disputes.
- `claim_daily_topup(user)` — see §6.

A nightly pg_cron job checks that every txn sums to zero and that `wallets.balance_kobo` equals the sum of entries; any mismatch alerts Sentry and freezes Pool for affected users.

## 3. Send
Wallet › Send, or the ₦ button in a chat. Pick a friend (only friends and contacts; strangers need an accepted chat first), amount, optional note → confirm sheet (avatar, full amount, "Virtual cash · can't be undone") → Face ID / fingerprint / device PIN (`expo-local-authentication`; if not enrolled, a 4-digit Dyce PIN stored as a salted hash server-side) → `transfer()` → "Sent ₦5,000" card posted in the chat + push to the receiver. Limits: ₦50,000 per send, ₦200,000 per day (config).

## 4. Request money with a QR code
**Create (requester).** Wallet › Request → amount (optional — "any amount" allowed), note, optional "from" (a specific friend or anyone) → `create_payment_request()` returns a request:
- `payment_requests(id uuid, code text unique (10 chars, base32, random), requester uuid, amount_kobo bigint null, note text, target_user uuid null, status enum(open, paid, expired, cancelled), expires_at (default 15 min for QR shown in person, 7 days when sent into a chat), paid_by uuid, txn_id uuid, created_at)`
- The app renders a **QR code** (react-native-qrcode-svg) of the URL `https://dyce.games/r/<code>` with the requester's avatar in the centre, amount and note under it, a countdown, and buttons Share link / Send to chat / Cancel. Screen brightness goes up while it's shown (expo-brightness) and back down after.
- Sending the request into a chat posts a `money_request` message with a Pay button; opening it shows the same QR full-screen.

**Pay by scanning (payer).** Wallet › **Scan** (also from the + in a chat and from the search button on Wallet):
- `expo-camera` `CameraView` with barcode scanning limited to QR; a viewfinder, torch toggle, and "Pick from photos" (scan a screenshot).
- Accept only `https://dyce.games/r/<code>`, `https://dyce.games/u/<username>` (personal code) and the `dyce://` equivalents. Anything else: "That's not a Dyce code."
- Resolve via Edge Function `resolve-qr` → returns requester public profile, amount, note, status, whether they're a friend/contact. Show the **Pay sheet**: avatar, name, "Not in your contacts" warning for strangers, amount (editable only for any-amount requests and personal codes), note, balance after.
- Confirm with biometric/PIN → `pay_payment_request(code, idem)` (or `transfer()` for a personal code). Errors: expired, already paid, cancelled, insufficient balance, self-payment, over limit, blocked.
- Success: receipt screen + "Paid ₦2,000 · for suya" card posted in the chat between the two users (a chat is created if none exists; for strangers it's created in the requester's Requests).
- Deep link: opening `https://dyce.games/r/<code>` with the system camera opens Dyce straight on the Pay sheet (universal/app links); without Dyce it opens a web page explaining Dyce with an install button.

**Personal "My code".** Wallet › My code shows a static QR for `https://dyce.games/u/<username>` — scanning it opens the Pay sheet with an amount field (and also offers "Add friend" / "Challenge").

**Safety.** Codes are random and single-use (amount requests). Requests expire. A user can have at most 10 open requests. Pay sheet always shows the real profile from the server, never data inside the QR. Rate limit scans that resolve to strangers (20/day).

## 5. Pools
Flow 1v1: sender picks stake → `stake_pool()` for the sender at invite time → invitee sees Match / Counter / Play free → Match = `stake_pool()` for invitee → match active. Counter: invitee proposes a new stake; sender's stake is adjusted (top-up or partial refund) when the counter is accepted. No response in 24h → `refund_match()`. Space pools: each seat pays the seat fee on join; leaving a waiting space refunds; once live, leaving forfeits.
Payout schemes: `winner_all`, `p50_30_20`, `p60_40` (by placement). No house fee in v1.
Pool requires `is_adult` and passing daily limits (`daily_usage`). Limits are config values; users can set lower personal limits in Settings.

## 6. Daily top-up
If balance < ₦10,000 the user can claim a free ₦20,000 top-up once per day (`system_topup`). Shown as a pill on the Wallet header and on the "Not enough Dyce Cash" sheet. Values in `app_config`.

## 7. History, receipts, disputes
History: filter All / Games / Sent / Received / Requests / Top-ups, grouped by day, each row links to a receipt (txn id, parties, game, match, timestamp, entries). Disputes: Pool result → Dispute (reason, note) → `disputes` row → status screen (Open → Reviewing → Resolved: upheld/reversed). Admin resolution uses `reverse_txn()`.

## 8. Tests that must exist
pgTAP: grant once; transfer success; insufficient funds; negative amount rejected; idempotent retry returns same txn; two concurrent spends of the last ₦1,000 → exactly one succeeds; request paid twice → second fails; expired request; self-payment rejected; settle with draw; settle 50/30/20 with remainder; refund on expiry; nightly invariant check finds a planted mismatch.
App: formatNaira table tests; Scan screen rejects foreign QR; Pay sheet shows server data not QR data; Maestro flow "request → scan on second device → paid card appears in chat".
