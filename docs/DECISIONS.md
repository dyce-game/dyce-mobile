# Decisions (ADRs)

One entry per decision, newest first.

## ADR-011 · Two repositories: the Expo app (Dyce) and the backend (dyce-backend) · 2026-11-15
Full text in `../dyce-backend/docs/DECISIONS.md`. App side: this repo is the Expo app at its root (no `apps/mobile`) plus `packages/ui`. `@dyce/shared` and `@dyce/games` are linked from `../dyce-backend/packages/*` (`link:` dependencies) and consumed as TypeScript source through the `dyce-source` condition. `metro.config.js` watches the linked folder and resolves every package from this project's `node_modules`; `tsconfig.json` sets `preserveSymlinks`; Jest maps both packages to source. Both folders must sit side by side; a release build pins the backend commit. Owner: platform-architect

## ADR-010 · One-to-one messaging, Requests and live delivery · 2026-11-15
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-009 · Friends list, accept and ignore · 2026-11-15
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-008 · Contact matching and friend requests · 2026-11-14
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-007 · Phone OTP auth, sessions and the age gate · 2026-11-14
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-005 · Explicit `.ts` extensions in shared packages · 2026-11-14
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-004 · NestJS + plain PostgreSQL replace Supabase · 2026-11-14
Backend decision: see `../dyce-backend/docs/DECISIONS.md`.
## ADR-006 · Hoisted node_modules for pnpm · 2026-11-14
Context: Metro (React Native) resolves poorly with pnpm's symlinked layout. Decision: `.npmrc` sets `node-linker=hoisted`. Consequences: weaker dependency isolation between workspaces; accepted. Owner: platform-architect

```
## ADR-000 · <title> · <date>
Context: …  Decision: …  Consequences: …  Owner: <agent>
```

## ADR-001 · Stack fixed by the lead analyst · kickoff
Context: Dyce needs cross-platform mobile, realtime chat, async and live games, and a safe virtual ledger.
Decision: Expo (Router, EAS) + Supabase (Postgres/Auth/Realtime/Edge Functions) + Colyseus for live rooms + shared pure-TS game engines; Skia for 2D, React Three Fiber for 3D; money as integer kobo in a double-entry ledger.
Consequences: game rules must be runtime-agnostic (Node, Deno, Hermes); all money and match changes go through server functions.
Owner: platform-architect

## ADR-002 · Avatar system: commissioned modular glTF rig, no Unity/C# · kickoff
Context: Dyce needs Memoji/Bitmoji-class editable avatars, cheap to show in long lists. Decision: commissioned Blender rig exported as modular GLB parts; live editing in R3F; server-rendered 2D images cached by config hash elsewhere; 220 AI-generated profiles as style bible and interim starter looks. No Unity (would add C#, a second engine and app size for no avatar benefit). Consequences: render service needed; artist brief and pipeline in docs/AVATAR_GUIDEBOOK.md. Owner: avatar-engineer

## ADR-003 · Domain dyce.games · kickoff
All links, universal links and app links use https://dyce.games. Owner: growth-invites-engineer
