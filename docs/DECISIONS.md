# Decisions (ADRs)

One entry per decision, newest first.

## ADR-005 · Explicit `.ts` extensions in shared packages · 2026-11-14
Context: `packages/games` must run unchanged in Node (NestJS, Colyseus, determinism script), Jest and Hermes. Decision: relative imports in `packages/games` and `packages/shared` end in `.ts`; `allowImportingTsExtensions` is on. Node 22 strips types natively, so `node script.ts` runs the engines with no build step. Consequences: no bundler-only resolution tricks in these packages. Owner: platform-architect

## ADR-004 · NestJS + plain PostgreSQL replace Supabase · 2026-11-14
Context: the product owner chose NestJS for the backend and plain Postgres with SQL migrations; NestJS owns the API. The kit assumed Supabase (Postgres, Auth, Realtime, Edge Functions) plus Colyseus.
Decision: `apps/api` is a NestJS app (REST + WebSocket gateway). PostgreSQL 16+ (tests run on 17) accessed with `pg` (no ORM, so the ledger functions stay explicit SQL). Migrations are ordered `.sql` files in `apps/api/db/migrations` applied by a small runner. Auth is ours: phone OTP (Termii/Twilio adapter), short-lived JWT + rotating refresh token. Realtime chat is a NestJS WebSocket gateway. Colyseus stays for live rooms and verifies our JWT. DB tests are Jest integration tests against a real Postgres (docker compose) instead of pgTAP. File storage (avatar renders, voice notes) is S3-compatible behind a `StorageService` interface; the provider is a [HUMAN] pick later.
Consequences: we now own OTP, sessions, rate limiting and websocket scaling that Supabase provided; all "RLS" rules from ARCHITECTURE §3 become service-layer authorization plus SQL constraints. Money, ledger and fairness rules are unchanged. Hosting: any Node + Postgres host (Fly.io + managed Postgres is the default). Owner: platform-architect, supabase-backend-engineer (now owns apps/api)

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
