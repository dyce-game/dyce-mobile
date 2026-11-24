# App Review notes (DRAFT to paste into App Store Connect > App Review Information)

Apple guideline 2.1(a) and 2.3.1(a): give the reviewer a way in, explain what is not obvious, and keep the backend live. **Fill in the
bracketed values, then delete this paragraph.** Nothing here has been submitted.

## Before you submit

1. Choose two demo identities (the reviewer needs a second player to see a multiplayer game). Pick two **numbers or email addresses you
   control** and two **6-digit codes** that are not guessable, then set this in the production API's environment (it is read at start-up):

   ```
   REVIEW_LOGINS=+2348000000001=<code one>;reviewer2@mail.dyce.games=<code two>
   ```

   Only those identities accept those codes; nothing is texted or emailed to them; the usual limits still apply (30 seconds between codes,
   five wrong tries lock a code); the accounts are ordinary accounts with no extra powers or money.
2. Sign in once yourself on a real phone with each demo identity, finish onboarding (name, username, "Continue without contacts"), and add
   the two accounts as friends of each other, so the reviewer finds a populated app. Claim the daily top-up on both.
3. Keep the API, game server, database, SMS and email running for the whole review (2.1).
4. After approval, **rotate or remove `REVIEW_LOGINS`** (the codes are in Apple's records), and set new ones for the next submission.

## Notes for the reviewer (paste)

**Sign in.** Dyce signs people in with a one-time code, with no password. Because you cannot receive a text or email, two demo accounts are
set up:

- Demo account 1: phone **[+234 ...]**, code **[------]**. On the Welcome screen tap **Get started**, enter the number, tap Continue, enter the code.
- Demo account 2: email **[reviewer2@...]**, code **[------]**. On the Welcome screen tap **Log in with email**.

If a code is refused after five wrong tries, wait five minutes. Both accounts are already friends and have Dyce Cash to play with.

**What the app is.** A messaging app where you send games to friends, like iMessage games. Games are played in the chat, or live in a
**Space** (a room with a code) for groups. Open the **games** button in a chat to pick a game.

**Dyce Cash is virtual.** Everyone starts with 200,000 Dyce Cash (shown with the sign Ð, not the naira sign). It is play money: it **cannot be bought, sold,
transferred for real money or withdrawn**, and there are **no in-app purchases**. The Wallet tab says it is virtual cash for play and not withdrawable. Nothing in the app takes a
card or a bank account.

**"Pool" games (simulated gambling).** In a Pool game, players stake Dyce Cash and the winner takes the pot. This is **simulated** gambling:
the stake and prize are Dyce Cash with no real-world value. Pools are for adults (the app asks a birth year and hides Pools for under 18s)
and we have answered the age-rating questions as for frequent simulated gambling. To see one: sign in as account 1, open a chat with
account 2, tap the games button, choose a game, choose **Pool**, then switch to account 2 on a second device or simulator (or play against a
practice bot in **Chat > Bots**, which needs no second account) and accept.

**People you do not know.** A stranger can never land in your chats: their first message waits in **Requests** until you accept. You can
**Report** and **Block** a person from their profile, from a chat, from a game menu and from a Space lobby. Names and messages pass a
filter for slurs and abusive terms before they are posted. Contact: **[support@dyce.games]**.

**Strangers in games.** "Quick match" pairs you with another player for one game; there is no open chat. Chat inside a live room is
filtered and can be reported.

**Account deletion.** Settings > Delete account (30-day grace, then the account and its personal data are erased). Settings > Download my
data exports it.

**Contacts (optional).** The app offers to find friends who are on Dyce. You can decline ("Continue without contacts") and still use
everything; friends can be found by username. Numbers are matched on our server and the numbers of people not on Dyce are not kept. An invite
text to someone not on Dyce is sent only when you tap **Invite to play** for that person, and the screen shows the exact message first.

**Analytics and crash reports** are off until you turn on Settings > Privacy > Share usage and crash data. We do not track people across
other companies' apps or websites and do not use the advertising identifier.

**Sign in with Apple.** Not offered because the app uses only its own account system (guideline 4.8).

**Push notifications** are optional and never required.

**Demo login explained.** The two demo accounts accept a fixed code (`REVIEW_LOGINS`); this exists only so App Review can sign in, affects
no other account, and is not a hidden feature.

## Metadata reminders (from APPLE_COMPLIANCE.md)

- Privacy Policy URL and Support URL: **[https://dyce.games/privacy]**, **[https://dyce.games/support]** (the pages must exist).
- Age rating: answer the questionnaire as in `APPLE_COMPLIANCE.md` section 6 (simulated gambling: frequent).
- App Privacy labels: `STORE_PRIVACY_ANSWERS.md` section 2 (the same list is in the app's privacy manifest).
- No other mobile platform named anywhere in the listing, screenshots or previews (2.3.10).
- Export compliance: standard encryption only (already declared in the build).
- Trader status if the app is offered in the EU.
