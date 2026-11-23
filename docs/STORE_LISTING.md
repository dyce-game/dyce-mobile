# Store listing (DRAFT copy)

Draft text for the App Store and Google Play. **Nothing here is submitted or approved**: it needs a human edit, the final names
(RELEASE_CHECKLIST H10), the legal and age-rating answers (L1, L4, H9) and the real screenshots (H7). Character counts were checked
when this was written; re-check after any edit (store limits are in brackets).

Rules for every line of copy (CLAUDE.md, SPEC section 14):
- Say plainly that **Dyce Cash is play money**: it cannot be bought, sold or withdrawn and has no real-world value. Never imply winnings.
- Never use the names **Uno** or **Scrabble** (use **Crazy Cards** and **Word Tiles**, final name still open, H10). Do not name other apps.
- Pools are **18+** and use Dyce Cash only.
- No emoji in the listing text itself is required; store text is plain.

## 1. Names and categories

| Field | Text | Limit |
|---|---|---|
| App name (iOS) | Dyce: Games with Friends | 30 (24 used) |
| Title (Google Play) | Dyce: Games with Friends | 30 (24 used) |
| iOS subtitle | Chat and play together | 30 (22 used) |
| Primary category | **Social Networking** (iOS), **Social** (Play): it is a messaging app first (SPEC principle 1) | |
| Secondary category | **Games > Board** (iOS) / Play has one category only: decide if "Social" or "Board" converts better after beta | |
| Content rating | Highest tier for **simulated gambling** is expected. Answer the questionnaires honestly (H9); Pools are hidden for under 18s | |

## 2. Short texts

**iOS promotional text (170, editable without a review):**
> Send a game like you send a message. Play with friends on iPhone and Android, stake Dyce Cash (play money) and meet new players in Spaces.

(138 used)

**Google Play short description (80):**
> Chat with friends and send them games. Play money, real fun. Android and iPhone.

(80 used)

**iOS keywords (100, comma separated, no spaces after commas, nothing already in the name):**
> games,friends,chat,whot,ludo,chess,ayo,darts,8 ball,mancala,word,cards,multiplayer,party,nigeria

(96 used). Do not add trademarks that are not ours. Review after beta using search-term data (to measure).

## 3. Full description (both stores, 4000 limit; about 1,750 used)

> **Dyce is a messaging app where games are what you send.**
>
> Chat with your friends like you always do. Then tap the games button, pick a game and send it. It lands in the conversation as a card: your friend taps it and you are playing. Friends on Android and iPhone play together.
>
> **Games for everyone**
> Sports: Cup Pong, 8 Ball, Darts, Basketball, Archery, Mini Golf. Board: Chess, Checkers, Ayo, Ludo, Sea Battle, Dots and Boxes. Words: Word Tiles, Word Hunt, Anagrams. Cards: Whot!, Crazy Cards. Party games for groups: Charades, Imposter, Werewolf, Doodle Guess. New games keep arriving.
>
> **Spaces for bigger groups**
> Start a Space, share the code or QR, and play party games and card tables live with three, five, ten friends. Or use quick match to find someone to play right now.
>
> **Dyce Cash: play money, real fun**
> Everyone starts with 200,000 Dyce Cash. Use it to stake in Pool games, send to friends, or request with a QR code. Dyce Cash is play money: it can never be bought, sold or cashed out, and it has no real-world value. Pool games are for adults only (18+).
>
> **Safe by design**
> People you do not know never land in your chats: they wait in Requests until you accept. Block and report anyone, any time. You choose who can send you requests, who sees you online and whether read receipts are on.
>
> **Your privacy**
> Dyce finds friends who are already on the app by checking your contacts on our server and never stores the phone numbers of people who are not on Dyce. You can download your data or delete your account from Settings.
>
> **Make it yours**
> Pick your look from a gallery of avatars, earn badges and levels, climb weekly leaderboards with friends.
>
> Dyce works on slower connections and is made with Nigeria first in mind, for players everywhere.

Claims to **verify before submission**: every game named above must be playable in the submitted build (the catalogue is behind a per-game `enabled` flag; trim the list to what ships); "quick match", "QR" and "download your data" are built, not yet seen on a device; "slower connections" has not been measured (3G tests are a QA gate, to measure) and should be removed if it fails.

## 4. What's new (first release)

> Welcome to Dyce. Chat, send games, and play with friends on any phone.

## 5. Screenshots plan

Use the real app on a real device or simulator, light mode and dark mode in separate sets; composite onto the phone frames and backgrounds in
`assets/marketing/` (`README.md` there: the images leave clear space for a headline, and their phone screens are abstract placeholders to be replaced
with real screens). Required sets (check current store requirements before building): iPhone 6.9-inch (and 6.5-inch if asked), Android phone.
A tablet set is not needed (`supportsTablet: false`).

| # | Screen to capture | Headline (top third, 5 words or fewer) | Background |
|---|---|---|---|
| 1 | A chat with a game card in it and a friend's reply | Send a game, not just a message | `dyce_01_appstore_hero_9x16.jpg` |
| 2 | The games drawer open over a chat | Pick a game, any game | brand colour |
| 3 | A 3D game mid-play (Cup Pong or 8 Ball) | Real physics, real rivalry | brand colour |
| 4 | A Space lobby or a live Whot! table with several players | Bring the whole group | `dyce_02_rooftop_friends_16x9.jpg` (cropped) |
| 5 | Wallet with Dyce Cash and the QR request | Play money. Real fun. | brand colour |
| 6 | Profile with badges, or a leaderboard | Earn your place | brand colour |

Rules: no real people's names or numbers on screen (use the demo accounts from `assets/avatar-profiles/`); show the "play money" wording on screen 5; never show
a real-money-looking amount without the Dyce Cash label. Promo video (optional): `dyce_04_story_challenge_9x16.jpg` is a vertical story still, not a video.
Marketing images are AI-generated, with fictional characters: say so if a store asks.

## 6. Review information (both stores ask)

- **A way for the reviewer to sign in.** Sign-in is a phone number and a texted code. The fixed test code `OTP_TEST_CODE` is **refused in production on purpose**, so
  a reviewer cannot sign in with it. **This is a launch blocker that is not built** (BACKLOG: "Store reviewer account"): the API needs a small allow-list of
  reviewer phone numbers with a fixed code, configured by an environment variable, disabled by default, and removed after approval. Until it exists, an app review will fail at the first screen.
- Notes to the reviewer: Dyce Cash is virtual and cannot be withdrawn or bought; Pool games are simulated gambling and are hidden for under 18s; the contacts permission is optional and explained before the system prompt.
- Support URL, marketing URL, Privacy Policy URL: HUMAN (H8).
- Account deletion: in the app, Settings > Delete account (required by both stores; built, 30 day grace).

## 7. Localisation

Launch in English only (the app is English). Use English (United Kingdom) as the base text to match Nigerian usage ("Draughts", "colour"); add other languages only after
the app itself is translated (BACKLOG).
