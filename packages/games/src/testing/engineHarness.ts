import fc from 'fast-check';
import type { GameEngine, PlayerId } from '../contract.ts';
import { hashState, stableStringify } from '../hash.ts';

export type HarnessOptions<S, A, Cfg> = {
  playerCounts: number[];
  cfg: Cfg;
  /** Candidate actions for `by` in state `s`. May include illegal ones; the harness filters with validate(). */
  candidates: (s: S, by: PlayerId) => A[];
  /** Actions that must always be rejected (or that are rejected in this state). Optional. */
  illegal?: (s: S, by: PlayerId) => A[];
  maxSteps?: number;
  numRuns?: number;
};

const names = (n: number): PlayerId[] => Array.from({ length: n }, (_, i) => `p${i + 1}`);

type Step<A> = { by: PlayerId; action: A };

function play<S, A, Cfg>(
  engine: GameEngine<S, A, Cfg>,
  opts: HarnessOptions<S, A, Cfg>,
  players: PlayerId[],
  seed: bigint,
  picks: number[],
): { final: S; log: Step<A>[] } {
  const maxSteps = opts.maxSteps ?? 2000;
  let s = engine.init(players, seed, opts.cfg);
  const log: Step<A>[] = [];

  for (let i = 0; i < maxSteps && !engine.isTerminal(s); i++) {
    const actors = engine.currentPlayers(s);
    if (actors.length === 0) throw new Error('Non-terminal state with no current players');
    for (const a of actors) {
      if (!players.includes(a)) throw new Error(`currentPlayers returned unknown player ${a}`);
    }
    const by = actors[(picks[i] ?? 0) % actors.length]!;
    const legal = opts.candidates(s, by).filter((a) => engine.validate(s, by, a).ok);
    if (legal.length === 0) throw new Error(`No legal action for ${by} in a non-terminal state`);
    const action = legal[(picks[i + 1] ?? 0) % legal.length]!;

    const before = stableStringify(s);
    const next = engine.apply(s, by, action);
    if (stableStringify(s) !== before) throw new Error('apply() mutated its input state');

    // Serialisable: survives a JSON round trip unchanged.
    if (stableStringify(JSON.parse(JSON.stringify(next))) !== stableStringify(next)) {
      throw new Error('State is not JSON round-trip stable');
    }
    log.push({ by, action });
    s = next;
  }
  return { final: s, log };
}

/**
 * Property-test an engine against the contract. Call inside a Jest file:
 *   describeEngine(pigEngine, { playerCounts: [2,3], cfg: {target: 30}, candidates: ... })
 */
export function describeEngine<S, A, Cfg>(
  engine: GameEngine<S, A, Cfg>,
  opts: HarnessOptions<S, A, Cfg>,
): void {
  const numRuns = opts.numRuns ?? 100;
  const arb = fc.record({
    n: fc.constantFrom(...opts.playerCounts),
    seed: fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
    picks: fc.array(fc.nat(1000), { minLength: 4000, maxLength: 4000 }),
  });

  describe(`engine contract: ${engine.slug}`, () => {
    it('random legal play never breaks invariants and terminates', () => {
      fc.assert(
        fc.property(arb, ({ n, seed, picks }) => {
          const players = names(n);
          const { final } = play(engine, opts, players, seed, picks);
          if (!engine.isTerminal(final)) throw new Error('Game did not terminate within maxSteps');
          if (engine.currentPlayers(final).length !== 0) {
            throw new Error('Terminal state still has current players');
          }
          const res = engine.result(final);
          const seen = res.placements.flat();
          if (new Set(seen).size !== seen.length) throw new Error('Player placed twice');
          if (seen.some((p) => !players.includes(p))) throw new Error('Unknown player in result');
          if (!res.draw && res.placements[0]?.length === 0) throw new Error('Empty winners');
        }),
        { numRuns },
      );
    });

    it('replaying the same seed and actions gives an identical state hash', () => {
      fc.assert(
        fc.property(arb, ({ n, seed, picks }) => {
          const players = names(n);
          const a = play(engine, opts, players, seed, picks);
          let s = engine.init(players, seed, opts.cfg);
          for (const step of a.log) s = engine.apply(s, step.by, step.action);
          if (hashState(s) !== hashState(a.final)) throw new Error('Replay diverged');
        }),
        { numRuns },
      );
    });

    it('init is deterministic', () => {
      fc.assert(
        fc.property(arb, ({ n, seed }) => {
          const players = names(n);
          const x = hashState(engine.init(players, seed, opts.cfg));
          const y = hashState(engine.init(players, seed, opts.cfg));
          if (x !== y) throw new Error('init is not deterministic');
        }),
        { numRuns },
      );
    });

    it('views are JSON-serialisable for every player and spectators', () => {
      fc.assert(
        fc.property(arb, ({ n, seed, picks }) => {
          const players = names(n);
          const { final } = play(engine, opts, players, seed, picks.slice(0, 40));
          for (const v of [...players, 'spectator' as const]) {
            JSON.stringify(engine.view(final, v));
          }
        }),
        { numRuns: Math.min(numRuns, 30) },
      );
    });

    if (opts.illegal) {
      const illegal = opts.illegal;
      it('illegal actions are rejected, not thrown', () => {
        fc.assert(
          fc.property(arb, ({ n, seed, picks }) => {
            const players = names(n);
            const { final } = play(engine, opts, players, seed, picks.slice(0, 20));
            for (const p of players) {
              for (const a of illegal(final, p)) {
                if (engine.validate(final, p, a).ok) throw new Error('Illegal action accepted');
              }
            }
          }),
          { numRuns: Math.min(numRuns, 30) },
        );
      });
    }
  });
}
