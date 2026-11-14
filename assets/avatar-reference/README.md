# Reference pack for the commissioned 3D avatar artist

AI-generated concept sheets (Higgsfield). They define the look and the catalogue; they are not production art. Brief: `docs/AVATAR_GUIDEBOOK.md` §5. Tiles read left to right, top to bottom.

| File | What it shows |
|---|---|
| `style_anchor_female.png`, `style_anchor_male.png` | The two style anchors every Dyce avatar was generated from. Match this look. |
| `ref01_style_lineup.jpg` | Six characters side by side: the range the style must cover |
| `ref02_turnaround_female.jpg` | Base female bust: front, 3/4, profile, back |
| `ref03_turnaround_male.jpg` | Base male bust: front, 3/4, profile, back |
| `ref04_expressions.jpg` | neutral, smile, grin, smirk, wink, laugh, surprised, shy, cool, sad, angry, shocked |
| `ref05_hair_african.jpg` | afro, afro puff, long box braids, box-braid bun, knotless + cuffs, fulani braids, cornrows, Ghana weaving, locs, locs bun, two-strand twists, bantu knots, threaded (irun kiko), low cut, 360 waves, high-top fade |
| `ref06_hair_global.jpg` | long straight, wavy shoulder, curly long, bob, pixie, high ponytail, messy bun, space buns, curtain bangs, buzz, textured crop, side part, undercut, quiff, man bun, slicked back |
| `ref07_headwear.jpg` | coral gele, emerald gele (wide), gold gele (small), red fila, aso-oke fila, kufi, navy hijab, dusty-rose hijab, satin headscarf, ankara headwrap, durag, beanie |
| `ref08_outfits.jpg` | agbada, lace buba, embroidered kaftan, ankara shirt, adire tie-dye, generic jersey, hoodie, varsity, denim jacket, blazer, turtleneck, bomber |
| `ref09_eyewear_accessories.jpg` | round, thin metal, bold black, cat-eye, aviator, sunglasses on head, large hoops, small hoops, studs, nose ring, beaded necklace, gold chain |
| `ref10_skin_tones.jpg` | 12-step skin tone ramp, deepest to fairest (the app ships 16; interpolate) |
| `ref11_facial_hair.jpg` | clean, stubble, moustache, goatee, chinstrap, short boxed, full, long full, salt-and-pepper |
| `ref12_face_parts.jpg` | eyes ×4, brows ×4, noses ×4, mouths ×4 |
| `blockout_bust.glb` | Rough AI image-to-3D mesh of the female anchor: a 3D sketch of the target proportions, **not** usable topology. Throw it away once the real base exists. |
| `fullbody_apose_female.png` | Full-body A-pose of the female anchor (jeans, white sneakers), used as the source of the rigged prototype |
| `rigged_prototype_wave.glb` | AI image-to-3D of the full-body A-pose: textured PBR, auto-rigged 24-bone humanoid skeleton, "Big Wave Hello" animation, ~57k triangles, 10 MB. A motion and look prototype only: one fused mesh with no swappable parts or face morphs. Online viewer: https://claude.ai/artifact/Wa7yHoeRacfeAdsaX7UPUP (owner-only until shared) |
