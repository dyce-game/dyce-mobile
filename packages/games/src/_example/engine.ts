import { z } from 'zod';
import type { GameEngine, GameResult, PlayerId, ValidateResult } from '../contract.ts';
import { nextInt, seedRng, type RngState } from '../rng.ts';

/**
 * "Pig" — the reference engine. Roll a d6 and add to your turn total; a 1 loses the turn total
 * and passes the turn; hold to bank. First to `target` wins. It uses the seeded RNG, has a turn
 * order, captures config in state at `init`, and keeps the RNG state out of `view()`.
 * New engines copy this shape.
 */
export type PigCfg = { target: number };

export type PigState = {
  players: PlayerId[];
  target: number;
  scores: Record<PlayerId, number>;
  turnPoints: number;
  turn: number; // index into players
  lastRoll: number | null;
  winner: PlayerId | null;
  rng: RngState;
};

export type PigAction = { kind: 'roll' } | { kind: 'hold' };

export const pigActionSchema: z.ZodType<PigAction> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('roll') }),
  z.object({ kind: z.literal('hold') }),
]);

export const pigEngine: GameEngine<PigState, PigAction, PigCfg> = {
  slug: '_example',
  actionSchema: pigActionSchema,
  timers: { turnMs: 30_000 },

  init(players, seed, cfg) {
    if (players.length < 2) throw new Error('Pig needs at least 2 players');
    if (new Set(players).size !== players.length) throw new Error('Duplicate players');
    if (!Number.isInteger(cfg.target) || cfg.target < 1) throw new Error('Invalid target');
    return {
      players: [...players],
      target: cfg.target,
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      turnPoints: 0,
      turn: 0,
      lastRoll: null,
      winner: null,
      rng: seedRng(seed),
    };
  },

  currentPlayers(s) {
    if (s.winner !== null) return [];
    const p = s.players[s.turn];
    return p === undefined ? [] : [p];
  },

  validate(s, by, a): ValidateResult {
    if (s.winner !== null) return { ok: false, code: 'game_over' };
    if (s.players[s.turn] !== by) return { ok: false, code: 'not_your_turn' };
    if (a.kind === 'hold' && s.turnPoints === 0) return { ok: false, code: 'nothing_to_hold' };
    return { ok: true };
  },

  apply(s, by, a) {
    const next: PigState = { ...s, scores: { ...s.scores } };
    const passTurn = () => (s.turn + 1) % s.players.length;

    if (a.kind === 'roll') {
      const [r, rng] = nextInt(s.rng, 6);
      const roll = r + 1;
      next.rng = rng;
      next.lastRoll = roll;
      if (roll === 1) {
        next.turnPoints = 0;
        next.turn = passTurn();
      } else {
        next.turnPoints = s.turnPoints + roll;
      }
      return next;
    }

    // hold: bank the turn total
    const banked = (s.scores[by] ?? 0) + s.turnPoints;
    next.scores[by] = banked;
    next.turnPoints = 0;
    next.lastRoll = null;
    if (banked >= s.target) next.winner = by;
    else next.turn = passTurn();
    return next;
  },

  isTerminal(s) {
    return s.winner !== null;
  },

  result(s): GameResult {
    if (s.winner === null) return { placements: [], draw: false };
    const byScore = new Map<number, PlayerId[]>();
    for (const p of s.players) {
      if (p === s.winner) continue;
      const sc = s.scores[p] ?? 0;
      byScore.set(sc, [...(byScore.get(sc) ?? []), p]);
    }
    const rest = [...byScore.entries()].sort((a, b) => b[0] - a[0]).map(([, ps]) => ps);
    return { placements: [[s.winner], ...rest], draw: false };
  },

  view(s) {
    // Never expose the RNG state: it would let a client predict future rolls.
    const { rng: _rng, ...visible } = s;
    return visible;
  },
};
