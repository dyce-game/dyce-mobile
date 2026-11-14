# Dyce Avatar Guidebook — building an editable 3D avatar (Memoji / Bitmoji class)

Audience: the avatar-engineer agent, the commissioned 3D artist, and the lead. Status: approved direction. Decisions: commissioned 3D art (modular rig), 220 AI-generated reference profiles (Higgsfield) as style bible + launch presets, domain `dyce.games`.

---

## 1. What we're building

Every Dyce player gets a warm, stylised 3D bust (see `design/avatars/` and `assets/avatar-profiles/`). They can edit it the way people edit a Memoji or a Bitmoji: pick a face, skin, hair, eyes, outfit and accessories; see it change live in 3D; save; and then see the same character everywhere — chat list, thread header, profile, push notifications, game tables, share cards.

Two things must both be true:
1. **Live and editable** in the builder (and later at 3D game tables): real-time 3D, swappable parts, sliders, colours, expressions.
2. **Cheap everywhere else**: chat lists show hundreds of avatars, so they must be cached 2D images, not live 3D scenes.

That gives the core architecture: **one modular 3D rig → config JSON → (a) live 3D in the builder and game tables, (b) server-rendered 2D images, cached by config hash, everywhere else.** This is the same split Bitmoji (server-rendered images) and Memoji (on-device 3D, exported as stickers) make.

## 2. Do we need C#?
**No.** C# would only be needed if we used the Unity engine (Unity scripts are C#), for example to run the avatar builder as an embedded Unity view. We don't need Unity:
- Runtime is **TypeScript**: three.js through React Three Fiber in Expo (already the 3D stack for games), plus a Node render service using the same code.
- The art pipeline is **Blender**, scripted in **Python** (`bpy`).
- File format is **glTF 2.0 / GLB**, which both three.js and Blender handle natively.

Choosing Unity would add a second rendering engine, a C# codebase, larger app size (Unity as a Library adds tens of MB), slower builds and a harder Expo integration — for no gain the avatar needs. **Revisit only if** Dyce later moves its 3D games to Unity; then the same GLB parts carry over. No C# prompt is included for that reason.

## 3. Architecture

```
Blender master file (artist)
   │  tools/avatar/export.py  (bpy: one GLB per part + manifest)
   ▼
assets pipeline (Node: gltf-transform → meshopt, KTX2/WebP textures, LOD1)
   ▼
CDN  avatar/<version>/{base.glb, hair_afro_01.glb, …, manifest.json, thumbs/*.webp}
   │                         │
   ▼                         ▼
App builder (R3F)      Render service (Node + headless three.js on GPU/SwiftShader)
live 3D, edits config   config → PNG/WebP 512/256/128 (+ poses later)
   │                         │
   └── profiles.avatar (JSON, validated by zod) ── hash ──► Storage avatars/<hash>@<size>.webp ► everywhere
```

### 3.1 Avatar config (v2) — `packages/shared/src/avatar.ts`
```ts
type AvatarConfigV2 = {
  v: 2;
  rig: 'dyce-bust-1';                // rig version the parts belong to
  body: { skinTone: SkinToneId; build: 'slim'|'average'|'broad' };
  face: Record<FaceMorph, number>;   // -1..1 sliders: jawWidth, chinLength, cheekFullness, faceLength, foreheadHeight, noseWidth, noseLength, noseBridge, lipFullness, mouthWidth, eyeSize, eyeSpacing, eyeTilt, browHeight, earSize …
  parts: {
    hair: PartId | null; brows: PartId; eyes: PartId; nose: PartId; mouth: PartId; ears: PartId;
    facialHair: PartId | null; eyewear: PartId | null; headwear: PartId | null;
    top: PartId; earrings: PartId | null; nosering: PartId | null; necklace: PartId | null;
  };
  colors: { hair: Hex; hairTips?: Hex; brows: Hex; eyes: Hex; lips: Hex; top: Hex; topSecondary?: Hex; eyewear?: Hex; headwear?: Hex; bg: Hex };
  marks: { freckles: 0|1|2; beautyMark: boolean; dimples: boolean; makeup?: MakeupId };
  expression: ExpressionId;          // default face in renders: 'smile' | 'grin' | 'smirk' | 'wink' | 'laugh' …
};
```
- Every `PartId` exists in the manifest for the given `rig`; zod refines against the manifest at runtime.
- `configHash = sha256(canonicalJSON(config))` → render file name. Same look = same file = free caching.
- Compatibility rules live in the manifest (e.g. `headwear: gele_*` hides `hair` except `hair_none`, `hijab_*` hides hair + ears + earrings; `eyewear` sits on `nose` socket).

### 3.2 Runtime in the app (builder + game tables)
- Load `base.glb` (head + neck + shoulders, skeleton, all face morph targets, ARKit-style expression morphs).
- Load selected part GLBs in parallel (cached with expo-file-system by `rig/version/partId`), **rebind each skinned part to the base skeleton** (`SkinnedMesh.bind(baseSkeleton)`), attach rigid parts (glasses, earrings) to named sockets (`socket_nose`, `socket_ear_L/R`, `socket_head_top`, `socket_neck`).
- Apply face sliders as morph target influences on the base **and on parts that carry matching corrective morphs** (hair and headwear follow head shape: artist provides `fit_headWidth`, `fit_faceLength`, … correctives).
- Materials: one shared PBR-lite toon-ish material family; tint by uniforms using RGB mask maps (R = primary tint, G = secondary, B = tertiary) so one texture serves every colour. Skin uses a tone ramp texture + subsurface approximation (wrap lighting) for the soft look in the references.
- Lighting rig = the reference look: warm key from upper left, soft fill, rim from behind, studio HDRI (small, 256px), ACES-ish tone mapping. Same rig in the render service so live and rendered images match.
- Idle life: blinks every 3–6 s, subtle breathing, eye saccades, look-at the finger while editing.
- Budgets (mid-range Android): base ≤ 12k tris, each part ≤ 4k (hair ≤ 6k), total scene ≤ 35k tris; textures 1024 (base) / 512 (parts), KTX2 where supported; first builder load ≤ 6 MB, ≤ 2.5 s on 4G; 60 fps target, 45 fps floor.

### 3.3 Render service (2D everywhere else)
- `apps/avatar-renderer`: Node service (Fly.io GPU machine if available, else CPU with SwiftShader/headless-gl) running the **same** three.js scene code from `packages/avatar-scene` (shared with the app; no RN imports).
- API: `POST /render { config, sizes: [512,256,128], pose: 'bust', expression }` (auth: service token) → writes `avatars/<hash>@<size>.webp` to Supabase Storage → returns URLs. Idempotent by hash.
- Triggered by the `save_avatar` RPC (enqueue in `avatar_render_jobs`, worker polls or gets a webhook). The app shows the live 3D snapshot (`gl.takeSnapshot` / R3F canvas capture) immediately as an optimistic local image until the server render lands.
- Later: poses and stickers (wave, celebrate, shocked, crying-laughing, GG) rendered the same way for game results and chat reactions.

### 3.4 What the rest of the app uses
`<Avatar userId size />` reads `profiles.avatar_hash` → loads `…/<hash>@<size>.webp` via expo-image (memory + disk cache, `recyclingKey`). No 3D in lists. Ever.

## 4. Builder UX (Memoji/Bitmoji patterns, Dyce look)
- **Layout:** top 55% = live 3D bust on a soft pedestal with the chosen background colour; bottom = category rail + options panel (sheet that can expand). Top bar: Cancel · title · Done.
- **Categories (in order):** Skin · Face shape · Hair · Brows · Eyes · Nose · Mouth · Ears · Facial hair · Eyewear · Headwear · Outfit · Accessories (earrings, nose ring, necklace) · Marks (freckles, beauty mark, dimples, makeup) · Background.
- **Camera focus:** each category animates the camera to the relevant area (Eyes → close on eyes; Outfit → pull back to shoulders); the model turns slightly toward camera; drag to rotate ±35°, pinch to zoom.
- **Options:** grid of **thumbnails rendered from the user's current avatar** with that option applied where cheap (hair, headwear, eyewear — rendered on device in a hidden low-res canvas, max 12 visible), otherwise pre-rendered neutral thumbnails from the CDN atlas. Selected option has the ember ring.
- **Colour:** swatch row per part (curated palette, incl. natural hair colours and a full skin tone ramp of 16 tones with undertone) + "custom" colour wheel for hair, outfit, background.
- **Sliders** for face shape (5–6 per sub-group) with haptic ticks at centre; "Reset this".
- **Randomise** (dice button — on brand), **Undo/Redo**, **Compare** (hold to see before).
- **Start from a look:** first screen of the builder shows ~24 presets (from the 220 profiles, filtered by what the user picks first: "Looks like me" quick picks of skin tone + hair type), then edit.
- **Expressions preview:** tap the face to cycle smile / grin / wink / laugh / surprised.
- **Accessibility:** every option has a text label for screen readers ("Hair: high afro puff, selected"); colour options announce names; sliders announce values; reduce motion disables idle animation and camera swoops.
- **Safety:** no free-text or user-uploaded textures in v1 (no moderation burden); offensive combinations are impossible by construction.
- **Save:** validates, writes config, optimistic snapshot, enqueues render, haptic success, returns to caller (onboarding → "Looks like me · Claim ₦200k").

## 5. Commission brief for the 3D artist (send this section)

**Style:** match `assets/avatar-reference/` (style anchors, turnarounds, expression and catalogue sheets, rough blockout GLB) and the 220 portraits in `assets/avatar-profiles/` — premium animated-film look, large expressive eyes with catchlights, soft subsurface skin, simplified but believable anatomy, friendly. Original design; do not imitate any studio's characters or Apple/Snap assets.

**Deliverables (v1, rig `dyce-bust-1`):**
| Item | Count | Notes |
|---|---|---|
| Base bust (head, neck, shoulders), unisex topology | 1 | Quad topology, clean edge loops for face; ≤ 12k tris; UDIM-free single UV set |
| Face shape morphs | 15–20 | jaw width, chin length, cheek fullness, face length, forehead, nose width/length/bridge, lip fullness, mouth width, eye size/spacing/tilt, brow height, ear size, masculine↔feminine |
| Expression morphs | ARKit 52 | Enables face tracking later; plus 8 baked combos (smile, grin, smirk, wink L, laugh, surprised, cool, shy) |
| Skeleton | 1 | root, spine, chest, neck, head, jaw, eye_L/R, shoulder_L/R (+ upper arms stubs); sockets: nose, ear_L/R, head_top, neck |
| Hair | 40 | ≥ 20 Afro-textured / African styles: afro, puff, high bun, box braids (long/bun), knotless + cuffs, fulani braids with beads, cornrows, Ghana weaving, locs (long/bun/tied), twists, bantu knots, threaded (irun kiko), low cut, 360 waves, fades (low/high-top/taper), sponge twists, bald; plus 20 global styles (straight/wavy/curly lengths, bob, pixie, ponytail, bun, buzz, undercut, quiff, man bun…). Each with `fit_*` corrective morphs. Hair-cards or sculpted-strand look, ≤ 6k tris |
| Brows / Eyes / Nose / Mouth / Ears | 12 / 12 / 10 / 10 / 4 | Eyes include iris colour mask and lid shapes; mouths include teeth/tongue for expressions |
| Facial hair | 12 | stubble (texture-based), short beard, full beard, goatee, moustache, chinstrap… |
| Eyewear | 12 | round, metal thin, bold black, cat-eye, aviator, sunglasses (+ "pushed up on head" variant) |
| Headwear | 20 | **gele (3 shapes)**, fila (red/aso-oke), kufi, hijab (2 drapes), satin headscarf, ankara headwrap, durag, beanie, cap (fwd/back), bucket hat, beret, bandana, headphones |
| Tops | 30 | tee, hoodie, varsity, denim jacket, blazer, turtleneck, bomber, polo, kaftan with embroidery, **agbada neckline**, **buba lace top**, **ankara shirt** (print via mask + pattern texture slot), adire tie-dye, football jersey (generic, no real badges), off-shoulder top… |
| Accessories | 15 | hoops (3 sizes), studs, nose ring, lip ring, chains (thin/beaded), AirPods-style generic earbuds (no logos) |
| Marks | — | freckles, beauty mark, dimples (morph), makeup layers (lip colour, liner) as texture layers |
| Thumbnails | all parts | neutral-base renders 256px via provided Blender scene |
| Blender source | all | Organised collections, applied transforms, named per convention |

**Technical rules:** Blender 4.x, metres, Y-up on export (glTF), −Y forward; names `cat_style_variant` (e.g. `hair_afro_puff_01`, `head_gele_wide_coral`); textures PNG 16-bit masters (we compress); RGB tint masks per part; no baked lighting in albedo; normal maps OpenGL; morph names exactly as specified; each part exports clean with `export.py` (we provide) and passes the viewer test.

**Milestones & acceptance:** M1 style frame (base + 3 hair + 2 tops, renders matching 5 reference profiles side by side) → M2 rig + morphs + 12 hair + 10 tops → M3 full catalogue → M4 polish + LODs. Each milestone accepted when parts load in our three.js test viewer (`tools/avatar/viewer`), meet budgets, fit all face morph extremes without clipping, and match the style frame.

**Rights:** work-for-hire with full IP assignment to Dyce (including source files), moral-rights waiver where allowed, no third-party assets without commercial licence listed in a ledger.

## 6. Asset pipeline (owned by avatar-engineer)
1. `tools/avatar/export.py` (bpy): for each collection → GLB with skeleton/morphs, tint masks, sockets; writes `manifest.json` (id, category, compatibility, hides, thumbnail, tris, bytes, colourable channels, default colours).
2. `tools/avatar/build.ts` (gltf-transform): dedupe, weld, meshopt compression, texture resize + KTX2 (fallback WebP), LOD1 at 50% for game tables; size report; fails CI over budget.
3. Version folder `avatar/<rigVersion>/<buildId>/` on Storage/CDN, immutable; app reads `manifest.json` URL from `app_config.avatar_manifest_url`.
4. `tools/avatar/viewer`: web viewer (three.js) loading any config for the artist and QA; visual regression screenshots of 30 fixed configs per build.
5. Thumbnails atlas generation via the render service.

## 7. The 220 Higgsfield profiles — what they are for
Delivered in `assets/avatar-profiles/` (1024px PNGs + `profiles.json` with each one's attributes). They are **2D concept renders**, not editable avatars. Use them as:
1. **Style bible** for the artist (Section 5) — the bar for skin, eyes, lighting, African hairstyles and headwear.
2. **Interim avatars** until the rig ships: onboarding offers "Pick a starter look" from the 220 (filter by skin tone / hair type); stored as `avatar: { v:1, preset: 'dyce_av_042' }`.
3. **Demo/seed accounts, bots and marketing** (staging seeds, Coach Cue etc., store screenshots). Never present them as real users in production.
4. **Preset targets** once the rig exists: recreate each profile as an `AvatarConfigV2` (`tools/avatar/presets.json`) — a tech-art task using the attribute list in `profiles.json`; users on v1 presets are migrated automatically to the matching v2 config.
Note on rights: these are AI-generated; keep the generation record (`profiles.json` holds prompts and job ids), don't register them as trademarks, and don't use any image that resembles a real person (QA should spot-check).

## 8. Phases
- **A (now, Phase 1 of the build):** static presets from the 220 profiles; `<Avatar>` component reading preset images; onboarding "Pick a starter look". Render service skeleton.
- **B (rig M2 delivered):** builder v1 with live 3D, config v2, render service live, migration from presets.
- **C (rig M3–M4):** full catalogue, expressions in game results, 3D busts at game tables (LOD1), stickers.
- **D (later, optional):** "Make from a selfie" — on-device face landmarks suggest skin tone/face shape/hair type (no photo leaves the device), face-tracked expressions using the ARKit morphs.

## 9. Claude Code prompts
**Kickoff for the lead session (Phase A + render service):**
```
Read docs/AVATAR_GUIDEBOOK.md fully. Use avatar-engineer to deliver Phase A: (1) import assets/avatar-profiles (220 PNG + profiles.json) into Supabase Storage via a seed script, generating 512/256/128 WebP; (2) avatar config v1 (preset) and v2 (rig) zod schemas in packages/shared with tests; (3) <Avatar> in packages/ui that renders v1 presets now and v2 hashes later, with expo-image caching and a 200-row list perf test; (4) onboarding step "Pick a starter look" with filters by skin tone and hair type, replacing the builder until Phase B; (5) apps/avatar-renderer skeleton (Node, headless three.js, POST /render, Storage upload, idempotent by hash) with a placeholder scene; (6) tools/avatar/{export.py, build.ts, viewer} scaffolds with READMEs matching Section 6. Then run code-reviewer and qa-engineer (avatar flows). Report sizes, fps and what the artist must deliver next.
```
**Kickoff when the artist delivers M2 (Phase B):**
```
Artist delivery M2 is in art/avatar/. Use avatar-engineer to run tools/avatar export + build, fix any budget failures by reporting them (don't edit art), then build the live 3D builder exactly as AVATAR_GUIDEBOOK §3.2 and §4 (R3F in Expo, skeleton rebinding, sockets, morph sliders, tint masks, camera focus per category, thumbnails, randomise/undo/compare, start-from-a-look presets), wire save → render service → avatar_hash, and migrate v1 presets to v2 using tools/avatar/presets.json. Visual regression: 30 fixed configs rendered by the service must match the in-app snapshot within tolerance. code-reviewer, then qa-engineer on a mid-range Android for fps and memory.
```
