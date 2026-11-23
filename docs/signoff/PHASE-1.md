# Phase 1 sign-off report: accounts, chat, wallet

qa-engineer, 2026-11-23. Source of the criteria: `docs/BUILD_PLAN.md` Phase 1. **No box is ticked by this report.**
Marks: **Proven** (a test or a run in this session), **By hand** (STATUS records a person walking it through), **Not shown**,
**Unverified** (needs a device, an account or a human). "Flow" means the Maestro flow in `e2e/`, executed on the web build by our
runner (`e2e/README.md`): it has not been run by Maestro or on a device.

## 1. The "done when" line

> a new user signs up with a phone, builds an avatar, gets ₦200k, finds contacts, chats in realtime, handles Requests, sends
> money to a friend, **requests money with a QR code and gets paid by a second phone scanning it**, and can block/report. Both
> themes, both platforms.

| # | Criterion | Evidence found | Mark |
| - | --------- | -------------- | ---- |
| 1 | Signs up with a phone | Backend: auth unit tests, the HTTP journey `apps/api/scripts/auth-e2e.mjs` (OTP, refresh, production refuses the test code), `db/tests`. App: `auth.test.ts` (single-flight refresh, session store, routing). **Flows 01 and 02** (new number, code, display name, username). Login churn: 300 sign-ups and 300 returning logins, 0 errors (`scripts/load/RESULTS.md` section 1). By hand (STATUS, ADR-007/008). | **Proven** with the OTP test code. **Unverified:** a real SMS (Termii, Twilio), Android SMS autofill, iOS code suggestion |
| 2 | Builds an avatar | Phase A only: 220 starter looks, `PUT /profile/avatar`, the "Pick your look" step (flow 01 picks one; `starter-logic.test.ts`). The live 3D builder, render service and `tools/avatar` pipeline are **not built** (they wait for the artist: BUILD_PLAN Phase 4 and `AVATAR_GUIDEBOOK.md`). | **Partly met.** The word "builds" is met by picking a starter look; the plan's builder is not there |
| 3 | Gets ₦200k | Backend ledger tests (idempotent welcome grant, invariant checks). Flows 01 and 02 end on `Balance ₦200,000`; every seeded person starts with ₦200,000 and Pool flows read it back from the API. | **Proven** |
| 4 | Finds contacts | Backend matching tests (hashed numbers, batches). App `contacts.test.ts`. **Flow 01**: allow contacts, "2 on Dyce", one-tap Add, invite rows for the rest, find by username; **flow 02**: denied ("Contacts are off", continue without). On web the address book is the dev sample and the denied path is a dev switch. | **Proven on web with the dev address book.** **Unverified:** the real OS permission prompts, a 500+ number address book, iOS "limited" access, the claim that numbers of non-users are not kept (a code and DB review, not a run) |
| 5 | Chats in realtime | Backend: the WebSocket suites and `pnpm e2e`. App: `chat-logic`, `chat-state`, live-client reconnect tests. **Flow 03**: a friend's message appears with no refresh. Load: 120 people in groups of 8, 1,200 messages, **8,400 of 8,400 deliveries, no duplicates, three runs** (`RESULTS.md` section 2). | **Proven** on one API instance. **Not shown:** two instances (the hub is in-process; BACKLOG says Redis), voice notes and photos (not built), push |
| 6 | Handles Requests | Strangers never land in Chat: backend tests (ADR-010), spam filter (integrity layer). **Flow 03**: two strangers in Requests, decline one, accept the other (the thread opens, the list shows them), "Requests" count falls. **Flow 07**: Requests then Report/Block. | **Proven** |
| 7 | Sends money to a friend | Backend ledger and wallet tests (double spend, idempotent retry, limits). App `wallet-logic.test.ts`. By hand in a browser, light and dark (STATUS, ADR-012). Flow 04 sends money through the pay-a-code path (balance after, paid screen, receipt). **No flow drives the Send sheet itself** (`send-money` is not written). | **By hand.** **Not shown:** the Send sheet in an automated run, biometric/PIN confirm (not built) |
| 8 | Requests money with a QR code and is paid by a second phone scanning it | **Flow 04**: Alice creates a ₦2,000 QR request, Ben (the API, as his app would after a scan) pays it, her screen turns "Paid by Ben QA", History shows "received ₦2,000"; the other direction: Ben shows a ₦1,500 code, Alice pays by code, "Balance after ₦200,500" is right before and after. Backend QR tests (`WALLET_AND_QR.md`). | **Proven for request, code and payment. NOT proven: the camera scan** (camera scanning is "open" in BUILD_PLAN: no scan screen reads a QR yet, `app/wallet/scan.tsx` is the entry). **BUG-1**: after "Paid" the Wallet tab keeps the old balance (below) |
| 9 | Can block and report | Backend safety tests (ADR-013). **Flow 07**: report with a reason, "also block" on, the person is gone from Requests, listed in Blocked people, unblock. | **Proven.** Moderation outcomes were added by the integrity layer (see Phase 3 report) |
| 10 | Both themes | The route walk renders all 60 routes in light and dark with no blank page (`docs/qa/REGRESSION.md` section 3). By hand in both themes (STATUS). | **Proven that they render.** **Not shown:** that they look right on devices |
| 11 | Both platforms | Only the web build has been run. | **Unverified.** No iOS or Android run of any kind |

## 2. Open items recorded in BUILD_PLAN for Phase 1 (still open)

Real SMS delivery; real contacts permission on devices; Android SMS autofill; notification permission and real push token; push for
friend requests and messages; voice notes and photos; group photo upload; real bots (the scripted ones exist); Redis for more
than one API instance; biometric or PIN confirm and camera scanning and "My code" in the wallet; the avatar builder (Phase B);
change username; presence switches; a real-device run of everything. The Phase 1 kickoff asked for **fps and cold-start numbers**
in the sign-off: **none exist** (no device).

## 3. Verified by hand (from STATUS, not repeated)

Onboarding, contacts matching with "On Dyce" suggestions and the denied path; friends list and requests; profile and settings;
avatar Phase A; chat list, Requests, threads with optimistic send, retry, typing, Sent/Read, paging, live delivery; groups, bots,
reactions, polls, message actions (dark; light by computed colours only); wallet send, QR request (watching for payment), pay by
code with the stranger warning, history, receipts, daily top-up, money cards in chat; block, report, blocked people. Light and dark, in a browser.

## 4. Verified here by QA (2026-11-23)

- Flows **00, 01, 02, 03, 04, 07, 08** executed on the web build (pass); linted clean.
- Route walk of all 60 routes, light and dark (`docs/qa/REGRESSION.md`).
- Login churn and chat fan-out load tests.
- Static accessibility audit: no touchable without an accessible name.
- App and backend gates (README table).

## 5. Bugs found that touch Phase 1 (`docs/qa/BUGS.md`)

- **BUG-1 (major)**: after a QR request is paid, the Wallet tab still shows the old balance and no new activity row until the tab
  remounts. The money is right on the server. This is the headline criterion of the phase. Reproduction: `e2e/known-bugs/bug-1-...yaml`.
- **BUG-0 (blocker, not a Phase 1 feature but found with it)**: the API wedges at 20 simultaneous game moves.
- **BUG-2 (major)**: Back from a thread after a game returns to the game screens (chat navigation).
- Hard-to-select controls and the missing `testID`s: `e2e/README.md` section 7.

## 6. Unverified: what a human must confirm before the box is ticked

1. A real SMS arrives on iOS and Android in Nigeria (Termii on the DND route, Twilio fallback); the code fills itself in.
2. Sign-up, contacts (allow, deny, limited), avatar, bonus, notifications **on an iPhone and on a 3 to 4 GB Android**, light and dark.
3. A QR request scanned **with the camera** of a second phone and paid; a bad and an expired code; the stranger warning.
4. Send money to a friend with the real confirm step; the wallet shows the right balance on both phones at once (after BUG-1 is fixed).
5. Realtime chat between an iPhone and an Android phone, including backgrounding, lock screen and reconnect; **push** for a
   message and a friend request.
6. Block and report from a thread, a profile and Requests on a device.
7. fps and cold start per `docs/qa/DEVICE_MATRIX.md`; the chat list with 500 conversations at 60 fps.
8. Screen reader and Dynamic Type 1.3x pass on every Phase 1 screen (`docs/qa/ACCESSIBILITY.md`).
9. **Product and legal**: "virtual cash, cannot be withdrawn" wording, the age gate placement (STATUS notes a launch blocker: no
   sign-up age gate), privacy copy for contacts, NDPA 2023.
10. The decision on the avatar: is a starter-look picker enough for "builds an avatar" at this phase, or does the box wait for the builder?
