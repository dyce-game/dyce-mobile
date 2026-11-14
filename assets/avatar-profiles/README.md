# 220 Dyce avatar profiles (AI-generated, Higgsfield)

- `img/dyce_av_001.webp` … `dyce_av_220.webp`: 1024×1024 head-and-shoulders portraits in the Dyce 3D style, flat colour backgrounds from the Dyce palette.
- `profiles.json`: one entry per image: `id`, `file`, `demo_name`, `gender`, `origin`, `group` (ng = Nigerian 120, af = rest of Africa + diaspora 35, world = 65), `age`, `skin`, `skin_group`, `hair`, `hair_color`, `hair_type`, `headwear`, `facial_hair`, `accessory`, `expression`, `top`, `top_color`, `bg`, the prompt text (`desc`), and `source` (Higgsfield job id, sheet and tile).
- `contact_sheet.jpg`: all 220 at a glance.

Uses (see `docs/AVATAR_GUIDEBOOK.md` §7): starter looks until the 3D rig ships, staging seed users and bots, marketing and store screenshots, and the style bible for the 3D artist. Every person shown is fictional. Don't present them as real users in production, and pull any image that turns out to resemble a real person (one was already regenerated for that reason: `dyce_av_139`).

Model: Higgsfield `gpt_image_2_6`, medium quality, two style-anchor images for consistency; most were generated as 3×3 sheets at 4K and cut into tiles.
