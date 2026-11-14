import { Rng, nextInt, nextU32, seedRng, shuffle } from './rng.ts';
import { GOLDEN } from './determinism/scenario.ts';

describe('xoshiro128** rng', () => {
  it('matches the golden vector (guards against accidental algorithm changes)', () => {
    const r = new Rng(GOLDEN.rngSeed);
    const out = Array.from({ length: GOLDEN.rngVector.length }, () => r.u32());
    expect(out).toEqual(GOLDEN.rngVector);
  });

  it('matches an independent BigInt reference implementation of xoshiro128**', () => {
    // Reference written straight from the published algorithm, using BigInt instead of
    // Math.imul/shift tricks, so a bug in rng.ts can't hide by agreeing with itself.
    const M = 0xffffffffn;
    const rotl = (x: bigint, k: bigint) => ((x << k) | (x >> (32n - k))) & M;
    let [s0, s1, s2, s3] = seedRng(2024n).map(BigInt) as [bigint, bigint, bigint, bigint];
    const ref = (): number => {
      const result = (rotl((s1 * 5n) & M, 7n) * 9n) & M;
      const t = (s1 << 9n) & M;
      s2 ^= s0;
      s3 ^= s1;
      s1 ^= s2;
      s0 ^= s3;
      s2 ^= t;
      s3 = rotl(s3, 11n);
      return Number(result);
    };
    const mine = new Rng(seedRng(2024n));
    for (let i = 0; i < 1000; i++) expect(mine.u32()).toBe(ref());
  });

  it('same seed → same stream; different seeds differ', () => {
    const a = new Rng(42n);
    const b = new Rng(42n);
    const c = new Rng(43n);
    const sa = Array.from({ length: 16 }, () => a.u32());
    const sb = Array.from({ length: 16 }, () => b.u32());
    const sc = Array.from({ length: 16 }, () => c.u32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('is pure: advancing returns a new state and leaves the old one alone', () => {
    const s0 = seedRng(1n);
    const copy = [...s0];
    const [, s1] = nextU32(s0);
    expect([...s0]).toEqual(copy);
    expect(s1).not.toEqual(s0);
  });

  it('seeds of 0 and 2^64 wrap safely and never give an all-zero state', () => {
    expect(seedRng(0n).some((v) => v !== 0)).toBe(true);
    expect(seedRng((1n << 64n) - 1n).some((v) => v !== 0)).toBe(true);
  });

  it('nextInt stays in range and is roughly uniform', () => {
    let s = seedRng(99n);
    const counts = new Array(6).fill(0) as number[];
    for (let i = 0; i < 60_000; i++) {
      const [v, next] = nextInt(s, 6);
      s = next;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });

  it('nextInt rejects bad bounds', () => {
    expect(() => nextInt(seedRng(1n), 0)).toThrow(RangeError);
    expect(() => nextInt(seedRng(1n), 1.5)).toThrow(RangeError);
  });

  it('shuffle returns a permutation and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const [out] = shuffle(seedRng(5n), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
