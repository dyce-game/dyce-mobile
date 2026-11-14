# Dyce — Claude Code build kit

Everything Claude Code needs to build Dyce (Expo + Supabase + Colyseus) with a team of sub-agents.

## What's inside
```
CLAUDE.md                     Project rules Claude Code loads every session
.claude/agents/*.md           19 sub-agents (one per role), ready for Claude Code
docs/SPEC.md                  Product spec (source of truth)
docs/ARCHITECTURE.md          Stack, repo layout, data model, game engine contract, realtime
docs/WALLET_AND_QR.md         Ledger, Pools, Send, Request-with-QR, Scan-to-pay, limits, tests
docs/GAMES.md                 23-game catalogue: 2D/3D, async/live, rules notes, launch order
docs/DESIGN_SYSTEM.md         "Tabletop" tokens, components, avatar, motion
docs/BUILD_PLAN.md            Phases, parallel lanes, kickoff prompts, definition of done
docs/AVATAR_GUIDEBOOK.md      Editable 3D avatar (Memoji/Bitmoji class): architecture, builder UX, artist brief, pipeline, prompts
docs/DECISIONS.md, BACKLOG.md Decision log (ADRs) and deferred items
assets/avatar-profiles/       220 AI-generated avatar portraits + profiles.json
assets/avatar-reference/      Reference pack for the 3D artist (style anchors, turnarounds, catalogues)
design/                       Design canvas screens (+ SCREENS.md route map, avatars/)
```

## How to use it
1. Create an empty repo and copy this kit's contents to its root.
2. Answer the remaining **[HUMAN]** decisions at the top of `docs/BUILD_PLAN.md` (accounts, game names, artist contract, legal). Domain `dyce.games` and the avatar direction are already set.
   Send `docs/AVATAR_GUIDEBOOK.md` §5 plus `assets/avatar-reference/` to the 3D artist.
3. Optional but recommended: export the design canvas artboards as PNGs into `design/png/` (same file names, `.png`) so agents can look at the screens.
4. Open Claude Code at the repo root and check the agents loaded: `/agents`.
5. Paste the **Phase 0 kickoff prompt** from `docs/BUILD_PLAN.md`. When a phase is signed off, paste the next phase's prompt.
6. Keep an eye on `docs/STATUS.md` (the lead session keeps it current) and `docs/DECISIONS.md`.

## Roles
Platform Architect · Design System · Supabase Backend · Auth & Onboarding · Avatar · Messaging · Wallet & Payments (QR) · Game Platform · Realtime & Spaces · Game Rules · 3D Games · 2D Games · Party Games · Social & Discovery · Growth & Invites · Trust, Safety & Compliance · QA · Release · Code Reviewer.

Models: agents that touch money, game outcomes, realtime or architecture run on `opus`; screen-heavy agents run on `sonnet`. Change the `model:` line in any agent file to suit your plan.
