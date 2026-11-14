import type { ZodType } from 'zod';

export type PlayerId = string;

export type ValidateResult = { ok: true } | { ok: false; code: string };

export type GameResult = {
  /** Index 0 = winners. Players tied on a placement share an inner array. */
  placements: PlayerId[][];
  draw: boolean;
};

/**
 * The rules-engine contract (docs/ARCHITECTURE.md §4).
 *
 * Engines are pure TypeScript: no Date.now(), no Math.random() (use rng.ts), no Node/DOM/RN APIs,
 * JSON-serialisable state, and `apply` never mutates its input. The same code runs in the app,
 * in NestJS and in Colyseus. Hidden information leaves the server only through `view()`.
 */
export interface GameEngine<S, A, Cfg = unknown> {
  slug: string;
  /** Deterministic: same players + seed + cfg → identical state. */
  init(players: PlayerId[], seed: bigint, cfg: Cfg): S;
  /** Who may act right now. Empty when the game is over. */
  currentPlayers(s: S): PlayerId[];
  validate(s: S, by: PlayerId, a: A): ValidateResult;
  /** Pure. Only call after `validate` returned ok. */
  apply(s: S, by: PlayerId, a: A): S;
  isTerminal(s: S): boolean;
  result(s: S): GameResult;
  /** What `viewer` may see: hides cards, ships, roles, words and the RNG state. */
  view(s: S, viewer: PlayerId | 'spectator'): unknown;
  /** zod schema for actions arriving over the wire. */
  actionSchema?: ZodType<A>;
  timers?: { turnMs: number; matchMs?: number };
}
