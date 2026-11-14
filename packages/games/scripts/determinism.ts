// Runs under Node >= 22 (native type stripping) and Deno:
//   node packages/games/scripts/determinism.ts [--print]
//   deno run packages/games/scripts/determinism.ts
import { GOLDEN, computeDeterminismReport, computeRngVector } from '../src/determinism/scenario.ts';

const report = computeDeterminismReport();
const rngVector = computeRngVector(GOLDEN.rngSeed, GOLDEN.rngVector.length || 8);

const args: string[] =
  (globalThis as { process?: { argv: string[] } }).process?.argv ??
  (globalThis as { Deno?: { args: string[] } }).Deno?.args ??
  [];

if (args.includes('--print')) {
  console.log(JSON.stringify({ rngVector, report }, null, 2));
} else {
  let failed = false;
  for (const [k, v] of Object.entries(report)) {
    if (GOLDEN.report[k] !== v) {
      failed = true;
      console.error(`MISMATCH ${k}: expected ${GOLDEN.report[k]}, got ${v}`);
    }
  }
  if (JSON.stringify(rngVector) !== JSON.stringify(GOLDEN.rngVector)) {
    failed = true;
    console.error(`MISMATCH rng vector: ${JSON.stringify(rngVector)}`);
  }
  if (failed) {
    (globalThis as { process?: { exit(c: number): void } }).process?.exit(1);
    throw new Error('Determinism check failed');
  }
  console.log(`determinism OK (${Object.keys(report).length} scenarios + rng vector)`);
}
