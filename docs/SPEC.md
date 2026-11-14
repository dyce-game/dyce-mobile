# Dyce — Product Spec (v1)

Owner: Lead Analyst. Status: approved for build. Visual reference: `design/` (see `design/SCREENS.md`).

## 1. What Dyce is
A messaging app where games are the main thing you send. You chat with friends, open the games drawer in the composer, pick a game, choose **Free** or **Pool**, and the game lands in the conversation as a card. Friends on Android and iOS play together. Bigger games (3+ players) run in **Spaces**. Strangers can find you and challenge you, but they wait in **Requests** until you accept. Everyone starts with **₦200k Dyce Cash** (virtual) to stake in Pool games, send to friends, or request with a QR code.

Primary market: Nigeria (₦, Nigerian names, Whot and Ayo in the catalogue). The app must also work anywhere else.

## 2. Principles
1. Feels like messaging first. Games come to the conversation, not the other way round.
2. Every game has Free and Pool. Free is the default for strangers and first games.
3. Nothing stressful in onboarding: phone, code, username, contacts, avatar. Under a minute.
4. Strangers are separated from people you know, always.
5. The money is play money. It's virtual, it can't be withdrawn, and the app says so wherever cash appears.

## 3. Navigation
- **Tab bar** (floating glass pill, bottom): **Chat · Spaces · Wallet**, plus a separate round **Search** button to its right. Active tab is ember-tinted. Chat shows an unread badge.
- **Header on tab screens:** profile avatar top-left (badge = unread notifications, opens Profile). Chat and Spaces have a round ember **+** top-right (Chat: new chat / new group; Spaces: create a space; Spaces › People: quick match). Wallet shows a "Daily top-up" pill top-right when a top-up is available.
- Notifications live inside Profile (bell + Notifications list), not in the header.
- Search button opens a full-screen search for the current tab (chats + people + games on Chat; spaces + codes on Spaces; transactions on Wallet).

## 4. Onboarding and auth
Screens: Welcome → Phone → Code (auto-filled from SMS where the OS allows) → Username → Contacts access → Avatar builder → Welcome bonus (₦200k moment) → Notifications ask → Chat.
- **Phone + OTP** via Supabase Auth (phone provider through an SMS hook; Termii for Nigerian numbers, Twilio fallback). Country picker defaults from device locale; E.164 normalisation.
- **Username:** 3–20 chars, `a-z 0-9 . _`, unique (case-insensitive), live availability check, suggestions on clash. Display name optional.
- **Contacts:** explain why before the OS prompt. If allowed, numbers are normalised on device, sent over TLS, HMAC-hashed with a server secret and matched server-side (raw numbers are never stored); matched contacts become suggestions ("On Dyce") and can be added as friends in one tap. If denied: empty state with "Allow in Settings" and "Find by username".
- **Avatar:** v1 (until the 3D rig ships): "Pick a starter look" from 220 avatar profiles, filtered by skin tone and hair type. v2: full 3D avatar builder like Memoji/Bitmoji — skin, face shape sliders, hair (incl. African styles), brows, eyes, nose, mouth, ears, facial hair, eyewear, headwear (gele, fila, hijab, durag…), outfits (ankara, agbada, buba, kaftan…), accessories, marks, background; randomise, undo, compare, expressions. "Looks like me · Claim ₦200k" finishes onboarding. Spec: `docs/AVATAR_GUIDEBOOK.md`.
- **Deep-link onboarding:** a user arriving from an invite link sees who invited them and which game, then the same flow, then lands straight in that game.
- **Age:** birth year asked only when first entering a Pool (18+ check). Under 18s can play Free only.

## 5. Chat tab
Title "Chat" with a live "N playing" chip. Filter tabs: **All · Friends · Groups · Requests (count) · Bots**.
- **Rows:** avatar (or triple avatar for groups, initials for SMS contacts, bot tile), name, last message preview, time, and a status tag: YOUR TURN (brass), POOL (ember), FREE (green), SPACE, SMS (blue), BOT, REQUEST. Online dot.
- **"Live now" strip** (All and Friends): friends currently online, tap to open their chat.
- **Requests:** privacy banner ("From people outside your contacts. They can't see your number or whether you've opened these." + "Who can reach me" link to settings). Chips: Game invites · N / Messages · N. Each request is a card: avatar, handle, level, wins, mutual count, time; the game tile with their note and mode chip (FREE or POOL ₦amount or seats/fee for spaces); buttons **Accept** (label adapts: "Match ₦1,000", "Take seat", "Play free"), **Decline**, **Block/Report**. Footer: "N filtered as spam · view".
- **Bots:** practice opponents for single-player warm-ups (Free only, no Pool). v1 bots: Coach Cue (8 Ball), Quiz Mama (trivia), Word Hunt Trainer, Admiral Ade (Sea Battle).
- Empty states: no friends yet (challenge a contact by SMS, quick match a stranger, find by username); contacts denied; no requests.

## 6. Conversations
- **Bubbles:** ember = Dyce message (in-app). **Blue = SMS** (recipient isn't on Dyce; the message was sent through the phone's SMS composer). Received = neutral.
- Text, voice notes (hold to record, slide to cancel), photos, replies, reactions (long-press menu), typing indicator, read receipts (can be turned off), delete for me / for everyone (15 min).
- **Composer:** text field, + (photo, voice), and the **games button** that opens the **Games drawer**.
- **Games drawer:** half-sheet with category chips (All, Party, Board, Sports, Word, Cards, Spaces 3+, Arcade) and a grid of game tiles. Each tile plays a short muted looping **video thumbnail** of the game (only visible tiles play), plus name, player count, and FREE/POOL availability. Tap → Mode sheet.
- **Mode sheet:** Free or Pool. Pool shows stake presets (₦500, ₦1,000, ₦2,000, ₦5,000, custom), your balance, pot size, and the rule line ("Winner takes ₦2,000. Draw refunds both. No reply in 24h refunds you."). Send.
- **Game cards in chat:** game art, mode badge, state ("Your turn", "Waiting for Amaka", "You won +₦1,500"), CTA. Turn-based games are played asynchronously from the card (iMessage-style).
- **Money in chat:** "Sent ₦5,000" and "Requested ₦2,000" cards (request card has Pay button and shows a QR when opened full-screen). See WALLET_AND_QR.md.
- **Groups:** up to 50 members, name + photo, polls ("What are we playing tonight?"), start a Space from the group, group game cards.
- **Chat info:** shared games history, head-to-head record, mute, block, report, clear chat.
- **Sending a game to a non-Dyce contact:** the app opens the SMS composer pre-filled with a fun invite and a link (`https://dyce.games/i/<token>`). The thread shows the blue SMS bubble and an "Invite sent · Cup Pong" state. Tapping the link on a phone without Dyce opens the **guest web game** (first game playable in the browser, no install), with "Get the app, keep the win" at the end.

## 7. Spaces tab
Spaces are rooms for 3+ players (and any game played with a group). Title "Spaces" + "N playing". Segmented switch **Spaces | People**.
- **Spaces:** "Join a space with a code" (code format `DY-XXXX`), **Your spaces** (cards: name, game, seats, status WAITING/LIVE, mode chip, member avatars), **Open now** (public spaces: game, host, seats, mode + fee + payout, Join).
- **People:** chips Playing now / Near you (opt-in, city-level only) / Top this week (leaderboard). Rows: avatar, handle, what they're playing or win count, FRIEND tag, Challenge button. Challenge sends a game invite that lands in their Requests.
- **Create a space:** game, name, Free or Pool, seat fee, payout scheme (Winner all / 50·30·20 / 60·40), seats, visibility (Friends, Public, Invite-only), start rule (when full / host starts). Creates a code and a share link.
- **Lobby:** seats, ready states, host controls (kick, start, lock), chat, invite friends, share code/QR, rules and pot.
- **Edge cases:** space full, host left (host passes to the longest-seated player; if none, space closes and fees refund), removed from space, space results with payouts.
- **Quick match:** pick game + mode, search animation, match found card with opponent level and win rate, 10s accept.

## 8. Wallet tab
Balance card (₦200k start, "Virtual cash for play · not withdrawable"), actions **Send · Request · Scan**, stats (won this week, win rate, pools today vs limit), recent activity, links to full history and receipts. "My code" QR for receiving. Daily top-up, limits and disputes. Full behaviour in `WALLET_AND_QR.md`.

## 9. Free and Pool modes (every game)
- **Free:** no cash moves. Rewards: XP (+25 for a win, +10 for playing, +5 daily first game), streaks (consecutive days with a win), badges, friends leaderboard. **Streak saver:** lose a streak and you get 24h to win one game to restore it.
- **Pool:** players stake Dyce Cash into an escrowed pot. 1v1: winner takes the pot. Spaces: payout scheme chosen by host. Draw: refund. Opponent doesn't respond to the invite in 24h: refund. Opponent abandons a running match past the turn timer: forfeit (they lose). **Counter-offer:** invitee can propose a different stake once; the sender accepts or declines.
- **Limits:** min stake ₦100, max stake ₦20,000 per game, max 20 Pool games per day, max ₦100k staked per day (configurable in `app_config`). Pool needs 18+ confirmation.
- **Disputes:** within 24h of a Pool result, a player can dispute (reasons list). Payout is held only if the result was flagged by the server's anti-cheat checks; otherwise disputes are reviewed and corrected with a reversing transaction.

## 10. Progress and social
Levels from XP, badges (first win, 10-game streak, Pool shark, Space host, Doodle artist, Whot master, etc.), weekly leaderboards (friends and global, per game), profile with stats, head-to-head, recent games, badges. Stranger profiles show "Not in your contacts" and mutual friends.

## 11. Notifications
Push for: your turn, new invite/request, pool matched/countered/expired/refunded, money received/requested, space starting, friend joined Dyce, streak at risk. Lock-screen actions (Play, Accept, Decline, Later). In-app Notifications list in Profile. Quiet hours setting.

## 12. Settings
Account (phone, username, display name), privacy (who can send requests: everyone / friends of friends / nobody; who can see me online; read receipts; Near you), notifications, blocked people, Pool limits (you can lower your own limits), data (download my data, delete account — balance cleared, games history anonymised), help & legal (terms, privacy, Pool rules, community guidelines).

## 13. Trust and safety
Block (they can't message, invite or see you online), report (reasons + optional evidence from chat), spam filter on requests (new accounts, mass-sending, reported users), rate limits on requests and money requests, profanity filter on usernames and Doodle Guess words, moderation queue table + admin-only Supabase views. Pool anti-cheat: server-authoritative moves, physics re-simulation, impossible-timing checks, collusion signals (same device/IP pairs repeatedly trading pots).

## 14. Compliance notes (Nigeria-first)
- Dyce Cash must never be purchasable or withdrawable. That keeps Pools as simulated gaming. Any change needs legal advice first (Nigerian gaming is regulated at state level, e.g. Lagos State Lotteries and Gaming Authority).
- App store ratings: declare simulated gambling (Pools). Pools hidden for users who aren't 18+.
- NDPA 2023: lawful basis + clear privacy notice, hashed contact numbers, data export and deletion, minimal location (city only, opt-in).

## 15. Out of scope for v1
Real-money anything, video/voice calls, desktop app, user-generated games, tournaments with brackets (backlog), ads.

## 16. Success metrics
Day-1 activation (first game sent within 10 min of signup) ≥ 60%. Invite → install conversion. Games per DAU. D7 retention. Pool share of games (healthy range 15–35%).
