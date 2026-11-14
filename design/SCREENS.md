# Design reference screens

These are the Dyce design canvas files (light screens; `*Dark.dc.html` are their dark-mode twins). They are HTML templates for the design canvas runtime, so they won't render on their own in a browser. View them in the Dyce design canvas (ask the product owner for the link or for PNG exports into `design/png/`). Read the files for exact copy, layout and colour values: each screen's script has a `const T={light:…,dark:…}` token object.

Naming: files that say Room/Rooms are **Spaces** in the product. `PlayScrabble` ships as **Word Tiles**. `Bounties` is not in v1.

`design/avatars/` holds 10 avatar style renders (the 3D look the avatar system must match).

| File | Screen | Route / where it lives | Dark twin |
|---|---|---|---|
| `PlayChess.dc.html` | Chess | g/[matchId] renderer | yes |
| `PlayCheckers.dc.html` | Checkers | g/[matchId] renderer | yes |
| `PlayScrabble.dc.html` | Scrabble | g/[matchId] renderer | yes |
| `PlayWordHunt.dc.html` | Word Hunt | g/[matchId] renderer | yes |
| `PlayAnagrams.dc.html` | Anagrams | g/[matchId] renderer | yes |
| `PlayMiniGolf.dc.html` | Mini Golf | g/[matchId] renderer | yes |
| `PlayFiller.dc.html` | Filler | g/[matchId] renderer | yes |
| `PlayDotsBoxes.dc.html` | Dots and Boxes | g/[matchId] renderer | yes |
| `PlayTanks.dc.html` | Tanks | g/[matchId] renderer | yes |
| `PlayCharades.dc.html` | Charades · 3D card | g/[matchId] renderer | yes |
| `PlayImposter.dc.html` | Imposter · round table | g/[matchId] renderer | yes |
| `PlayImposterRole.dc.html` | Imposter · your role | g/[matchId] renderer | yes |
| `PlayWerewolf.dc.html` | Werewolf / Mafia · campfire | g/[matchId] renderer | yes |
| `PlayBasketball.dc.html` | Basketball · 3D court | g/[matchId] renderer | yes |
| `PlayArchery.dc.html` | Archery · 3D range | g/[matchId] renderer | yes |
| `PlayAyo.dc.html` | Ayo Olopon · 3D board | g/[matchId] renderer | yes |
| `PlayMancala.dc.html` | Mancala mode | g/[matchId] renderer | yes |
| `PlayLudo.dc.html` | Ludo · tilted board | g/[matchId] renderer | yes |
| `PlayCupPong.dc.html` | Cup Pong · 3D first-person | g/[matchId] renderer | yes |
| `Play8Ball.dc.html` | 8 Ball · 3D table | g/[matchId] renderer | yes |
| `PlayDarts.dc.html` | Darts · 3D board | g/[matchId] renderer | yes |
| `PlaySeaBattle.dc.html` | Sea Battle · 3D isometric | g/[matchId] renderer | yes |
| `PlayCrazyCards.dc.html` | Crazy Cards (Uno-style) · space | g/[matchId] renderer | yes |
| `PlayWhot.dc.html` | Whot! · space | g/[matchId] renderer | yes |
| `Card.dc.html` | Component · card (game, kind, colour, value, shape) | Card component (game cards art) | — |
| `PlayCards.dc.html` | Card table (base for both card games) | g/[matchId] renderer | yes |
| `Chats.dc.html` | Chat tab · All (5 filters) | (tabs)/chat | yes |
| `ChatsGroups.dc.html` | Chat · Groups | (tabs)/chat ?filter=groups | yes |
| `Requests.dc.html` | Chat · Requests | (tabs)/chat ?filter=requests | yes |
| `ChatsBots.dc.html` | Chat · Bots | (tabs)/chat ?filter=bots | yes |
| `Space.dc.html` | Spaces tab | (tabs)/spaces | yes |
| `RoomsHome.dc.html` | Spaces tab · People | (tabs)/spaces ?seg=people | yes |
| `Main.dc.html` | 1 · Welcome | (auth)/welcome | yes |
| `Phone.dc.html` | 2 · Phone + auto-filled code | (auth)/phone + code | yes |
| `Username.dc.html` | 3 · Pick a username | (auth)/username | yes |
| `Contacts.dc.html` | 4 · Contacts access | (auth)/contacts | yes |
| `AvatarBuilder.dc.html` | 5 · Avatar builder | (auth)/avatar, profile/edit | yes |
| `Thread.dc.html` | 7 · Chat with a Dyce friend | c/[conversationId] | yes |
| `Games.dc.html` | 8 · Games drawer | games drawer sheet (composer) | yes |
| `Invite.dc.html` | 10 · Game sent to a non-Dyce contact | c/[id] after SMS invite | yes |
| `InviteLanding.dc.html` | 11 · What the invitee opens | web: i/[token] | yes |
| `CreateRoom.dc.html` | 13 · Create a space | s/create | yes |
| `Lobby.dc.html` | 14 · Space lobby | s/[spaceId]/lobby | yes |
| `Wallet.dc.html` | 15 · Wallet tab | (tabs)/wallet | yes |
| `SendMoney.dc.html` | 16 · Send money in chat | wallet/send | yes |
| `Avatar.dc.html` | Component · 3D avatar | packages/ui Avatar | — |
| `TabBar.dc.html` | Component · tab bar (Chat · Spaces · Wallet + search) | packages/ui TabBar | — |
| `ModeSheet.dc.html` | 17 · Pick Free or Pool | mode sheet | yes |
| `PoolInvite.dc.html` | 18 · Pool challenge: match, counter or go free | c/[id] pool invite | yes |
| `PoolResult.dc.html` | 19 · Pool result (win / lose / draw tweak) | g/[matchId] result (pool) | yes |
| `FreeResult.dc.html` | 20 · Free result: XP, streak, badge | g/[matchId] result (free) | yes |
| `Bounties.dc.html` | 21 · King of the Hill (pool + free) | NOT IN V1 (old King of the Hill concept) | yes |
| `PoolRules.dc.html` | 22 · How pools work + limits | sheet: how pools work | yes |
| `DoodleRoom.dc.html` | 24 · In space: Doodle Guess pool | g/[matchId] doodle | yes |
| `QuickMatch.dc.html` | 25 · Quick match with a stranger (state tweak) | quick-match | yes |
| `GameDetail.dc.html` | 26 · Game detail page | game detail sheet | yes |
| `Activity.dc.html` | 27 · Notifications (from Profile) | profile/notifications | yes |
| `Profile.dc.html` | 28 · My profile | profile | yes |
| `UserProfile.dc.html` | 29 · Stranger's profile | u/[username] | yes |
| `GroupChat.dc.html` | 30 · Group chat with poll + space | c/[conversationId] (group) | yes |
| `Leaderboard.dc.html` | 31 · Weekly leaderboard | leaderboard | yes |
| `Settings.dc.html` | 32 · Settings | settings | yes |
| `NewChat.dc.html` | 34 · New chat | new-chat | yes |
| `NewGroup.dc.html` | 35 · New group | new-group | yes |
| `Bonus.dc.html` | 36 · ₦200k welcome moment | (auth)/bonus | yes |
| `NotifPermission.dc.html` | 37 · Notifications ask | (auth)/notifications | yes |
| `EmptyChats.dc.html` | 38 · Empty: no friends yet | (tabs)/chat empty | yes |
| `EmptyDenied.dc.html` | 39 · Empty: contacts off | (tabs)/chat contacts off | yes |
| `EmptyRequests.dc.html` | 40 · Empty: no requests | (tabs)/chat requests empty | yes |
| `DeepLinkOnboard.dc.html` | 41 · Sign up from an invite | i/[token] (installed, new user) | yes |
| `Waiting.dc.html` | 42 · Waiting for their turn | g/[matchId] waiting | yes |
| `Notifications.dc.html` | 43 · Push notification set | push notification set | yes |
| `GameIssues.dc.html` | 44 · Opponent reconnecting | g/[matchId] reconnecting | yes |
| `GameOffline.dc.html` | 45 · You're offline | g/[matchId] offline | yes |
| `GameForfeit.dc.html` | 46 · Forfeit warning | g/[matchId] forfeit sheet | yes |
| `GameMenu.dc.html` | 47 · In-game menu | g/[matchId] menu | yes |
| `PoolIssues.dc.html` | 48 · Not enough Dyce Cash | sheet: not enough Dyce Cash | yes |
| `PoolLimit.dc.html` | 49 · Daily limit reached | sheet: daily limit | yes |
| `CounterReceived.dc.html` | 50 · Counter-offer + refund card | c/[id] counter card | yes |
| `RoomResult.dc.html` | 51 · Space results + payouts | s/[spaceId]/results | yes |
| `JoinRoom.dc.html` | 52 · Join with a code | s/join | yes |
| `RoomFull.dc.html` | 53 · Space full | s/join (full) | yes |
| `RoomHostLeft.dc.html` | 54 · Host closed space | s/[id] (host closed) | yes |
| `RoomRemoved.dc.html` | 55 · Removed from space | s/[id] (removed) | yes |
| `Report.dc.html` | 56 · Report | report | yes |
| `ReportDone.dc.html` | 57 · Report sent | report (sent) | yes |
| `BlockedList.dc.html` | 58 · Blocked people | settings/blocked | yes |
| `WebGame.dc.html` | 59 · Guest plays in browser | web: guest game | yes |
| `WebGameEnd.dc.html` | 60 · Guest game over | web: guest game end | yes |
| `AgeGate.dc.html` | 61 · 18+ check for pools | sheet: 18+ check | yes |
| `EditProfile.dc.html` | 62 · Edit profile | profile/edit | yes |
| `DeleteAccount.dc.html` | 63 · Delete account | settings/delete | yes |
| `Help.dc.html` | 64 · Help and legal | settings/help | yes |
| `ChatInfo.dc.html` | 71 · Chat info | c/[id]/info | yes |
| `MessageActions.dc.html` | 72 · Reply, voice note, typing | c/[id] composer states | yes |
| `MessageLongPress.dc.html` | 73 · Long-press: reactions + menu | c/[id] long-press menu | yes |
| `WalletHistory.dc.html` | 74 · Wallet history | wallet/history | yes |
| `Receipt.dc.html` | 75 · Receipt | wallet/receipt/[txnId] | yes |
| `RequestMoney.dc.html` | 76 · Request Dyce Cash | wallet/request (add QR card) | yes |
| `MoneyInChat.dc.html` | 77 · Cash received in chat | c/[id] money cards | yes |
| `Friends.dc.html` | 78 · Friends (swipe to remove) | friends | yes |
| `FriendRequests.dc.html` | 79 · Friend requests | friends/requests | yes |
| `SpaceSearch.dc.html` | 80 · Search results | search ?scope=… | yes |
| `SearchRecent.dc.html` | 81 · Search: recent | search (recent) | yes |
| `SearchEmpty.dc.html` | 82 · Search: no results | search (empty) | yes |
| `Dispute.dc.html` | 83 · Dispute a result | dispute/[matchId] | yes |
| `DisputeStatus.dc.html` | 84 · Dispute status | dispute/[matchId] status | yes |
| `TopUp.dc.html` | 85 · Daily top-up | wallet/topup | yes |
| `Badges.dc.html` | 86 · All badges | profile/badges | yes |
| `BadgeDetail.dc.html` | 87 · Badge detail | profile/badges/[slug] | yes |
| `Moments.dc.html` | 88 · Level up | g/[matchId] level up | yes |
| `StreakLost.dc.html` | 89 · Streak lost + saver | g/[matchId] streak lost | yes |
