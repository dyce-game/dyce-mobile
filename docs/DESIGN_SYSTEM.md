# Dyce — "Tabletop" design system

Dyce should feel like a warm game table, not a generic chat app: ember and brass on cream (light) or warm black (dark), chunky "token" buttons with a solid bottom edge, glass floating controls, 3D-looking avatars. Reference screens: `design/` (`design/SCREENS.md` lists them; view in the design canvas or `design/png/`, read the files for exact values). Avatar style references: `design/avatars/`.

## Colour tokens (`packages/ui/src/tokens.ts`)
| Token | Light | Dark | Use |
|---|---|---|---|
| bg | #FBF8F3 | #0F0D0B | screen background (dark is warm black, never #000) |
| card | #FFFFFF | #1D1916 | cards, sheets |
| chip | #EEE7DC | #2A2420 | chips, secondary buttons, inputs |
| chipEdge | #D8CEC1 | #15120F | token-button bottom edge for chips |
| line | #E6DDD0 | #2E2823 | dividers, borders |
| text | #1B140F | #F7F1E8 | primary text |
| sub | #6F655B | #ABA196 | secondary text |
| accent | #B33416 | #FF8F6B | links, accent text |
| brandSoft | #FBE7DF | #3A170C | soft ember fills |
| money | #17834F | #3DDC84 | Free badges, positive money |
| glass | rgba(255,255,255,.62) | rgba(42,36,32,.60) | glass surfaces (with blur 18–24) |
| glassEdge | rgba(255,255,255,.90) | rgba(255,255,255,.10) | glass border |
| glassShadow | rgba(90,40,10,.12) | rgba(0,0,0,.45) | floating shadow |
| glowA / glowB | rgba(227,169,59,.22) / rgba(201,62,28,.14) | rgba(227,169,59,.12) / rgba(201,62,28,.16) | the two soft background glows on the tab screens (`<Glow>`) |

Fixed brand colours (both themes): **Ember** #C93E1C (edge #8A2410) = Dyce, primary, POOL badge, Dyce chat bubbles · **Brass** #E3A93B (edge #A86F12, text #3A2400) = coins, pots, YOUR TURN · **Felt** #17834F (edge #0C5A34) = FREE · **SMS blue** #0A66D1 (edge #064A99) = SMS bubbles and tags · **Bot violet** #5A4FCF · **Online** #2BB673.

## Type
Figtree (body/UI: 400–900) and Bricolage Grotesque (display: 600–800). Scale: Display 38/800/-1 (tab titles), Title 28/800, Headline 20/800, Body 16/500, Callout 15/700, Footnote 13/600, Caption 11/800 uppercase +0.4 tracking (badges). Respect Dynamic Type up to 1.3×.

## Shape and depth
Radii: chips 16, buttons 21–27 (pill), cards 22–24, sheets 28 top, tiles 13–18. **Token button:** solid fill + `0 3px 0 <edge>` bottom shadow + inset top highlight `rgba(255,255,255,.25)`; on press, translateY(2px) and shadow shrinks to 1px (Reanimated, 90ms) + light haptic. **Glass:** expo-blur `BlurView` intensity ~40 (light tint / dark tint) + glass fill + 1px edge + floating shadow.

## Components (build in `packages/ui`)
TabBar (glass pill Chat · Spaces · Wallet with active highlight + separate glass search circle; 68pt tall, 26pt from bottom, fade-to-bg gradient behind) · HeaderAvatar (profile, ember ring, badge) · PlusButton (42pt ember token) · WalletPill (coin + compact amount) · FilterTabs (underline, ember 3pt bar; count pill; built, in `@dyce/ui`) · SegmentedControl (Spaces | People) · ChatRow · GroupAvatar (3 stacked) · Bubble (dyce/sms/received, tails) · GameCard (in-chat) · GameTile (video thumbnail) · ModeBadge (FREE/POOL/SPACE/YOUR TURN/SMS/BOT/REQUEST) · RequestCard · SpaceCard · PersonRow · Sheet (bottom sheet with grabber) · AmountPad · ConfirmSheet · QRCard (QR + avatar centre + amount + countdown) · ScannerOverlay · ResultHero (Free / Pool / Space results) · Avatar (see below; `<Avatar>` in `@dyce/ui` shows a picture or the initial, `<UserAvatar>` in the app maps a saved look) · EmptyState · Toast · Banner (reconnecting/offline).

## Avatar
Look: soft 3D animated-film style (large expressive eyes, warm studio light, coloured flat background, shoulders + top visible). Full system — modular glTF rig from a commissioned artist, live 3D builder in R3F, server-rendered 2D images cached by config hash everywhere else — is specified in `docs/AVATAR_GUIDEBOOK.md`. Until the rig ships, avatars are the 220 starter looks in `assets/avatar-profiles/`.

## Motion
Spring defaults (damping 18, stiffness 220). Sheets slide 280ms. Game card "your turn" pulse. Result screens: confetti (Skia) for wins, coin burst (brass) for Pool payouts. Respect Reduce Motion (swap to fades).

## Iconography
Custom SVG set in `packages/ui/icons` (stroke 2–2.4, rounded caps): chat bubble, planet (Spaces), wallet, search, plus, back, menu, shield, block, QR, scan, send, request, history, bell, gear. No emoji in UI.

## Copy voice
Short, warm, a bit playful, Nigerian-English friendly ("Your move, oga" in sample data only — never put slang in system copy). Money lines always state "virtual".
