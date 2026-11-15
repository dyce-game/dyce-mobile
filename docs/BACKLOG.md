# Backlog (out of scope for v1)

- Tournaments with brackets
- Voice/video in Spaces
- Desktop/web app beyond the guest game
- User-made word packs and Doodle themes
- Real-money anything (needs legal review first; see SPEC §14)
- King of the Hill / Bounties (old design concept, `design/Bounties.dc.html`)

## Messaging follow-ups (deferred from ADR-010)
- Groups (create, members, admins, polls), Bots, the "Live now" strip, online presence and "Active now"
- Replies, reactions, delete for me / for everyone, voice notes, photos
- Mute / archive / delete, a read-receipt opt-out, the "Add friend" choice when accepting a request
- Push for new messages; Redis pub/sub for the realtime hub before running more than one API instance
- FlashList and the 5,000-message scrolling pass on a mid-range Android

## Games platform follow-ups (deferred from ADR-016; server items are in dyce-backend/docs/BACKLOG.md)
- Pool matches: stakes (`stake_pool`), age gate, mode sheet stake presets and pot, counter-offer (once), 24h no-reply refund, daily limits, payout on finish (`settle_match` already handles the ledger)
- Turn timers and forfeit past the timer (`turn_deadline` is not set yet), "No reply in 24h" invite expiry as a scheduled job (today an invite expires when it is next read)
- Push for "your turn", invites and results; the chat list preview ("Your turn") for a game card
- XP, streaks, badges, the friends leaderboard and the result screen's XP/streak panels; stats on Profile and head-to-head in Chat info
- Games drawer: video thumbnails, search, the category chips beyond what exists, Spaces tiles; the drawer/mode sheet from a group chat
- Dispute and anti-cheat signals on matches; spectators
- Reconnect/offline banners and forfeit sheet on the host shell (designs GameOffline, GameForfeit, GameMenu)
