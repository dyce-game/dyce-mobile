import { hashState } from '../hash.ts';
import { pigEngine, type PigAction } from '../_example/engine.ts';
import { Rng } from '../rng.ts';

/**
 * Cross-runtime determinism scenario (docs/ARCHITECTURE.md §6).
 * Runs the same scripted games and returns hashes. It must give identical output in
 * Node (jest + `pnpm test:determinism`), Deno, and Hermes (the app's `_dev/determinism` screen).
 * This file uses only language features available in all three: no Intl, no Date, no Math.random.
 */
export const SCENARIO_SEEDS: readonly bigint[] = [1n, 42n, 0xdeadbeefn, (1n << 63n) + 12345n];

function scriptedGame(seed: bigint): string {
  const cfg = { target: 40 };
  let s = pigEngine.init(['a', 'b', 'c'], seed, cfg);
  for (let i = 0; i < 5000 && !pigEngine.isTerminal(s); i++) {
    const by = pigEngine.currentPlayers(s)[0]!;
    // Deterministic policy: hold at 12+, otherwise roll.
    const act: PigAction = s.turnPoints >= 12 ? { kind: 'hold' } : { kind: 'roll' };
    s = pigEngine.apply(s, by, act);
  }
  return hashState(s);
}

export function computeDeterminismReport(): Record<string, string> {
  const report: Record<string, string> = {};
  for (const seed of SCENARIO_SEEDS) report[`pig:${seed.toString()}`] = scriptedGame(seed);
  return report;
}

/** Golden values. Regenerate deliberately with `pnpm -F @dyce/games determinism -- --print`. */
export const GOLDEN = {
  rngSeed: 123456789n,
  rngVector: [
    525828425, 3007259908, 2366513248, 2649385779, 292938192, 155462125, 220534550, 1356111692,
  ] as number[],
  report: {
    'pig:1': 'e85ede84e530469d',
    'pig:42': 'b292546cf6772a21',
    'pig:3735928559': '5086355e279f71d6',
    'pig:9223372036854788153': 'd6bcfd691ba4618e',
  } as Record<string, string>,
};

export function computeRngVector(seed: bigint, n: number): number[] {
  const r = new Rng(seed);
  return Array.from({ length: n }, () => r.u32());
}
