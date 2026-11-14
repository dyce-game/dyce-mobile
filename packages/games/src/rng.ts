/**
 * Seeded xoshiro128** with a purely functional API, so the generator state can live inside a
 * JSON-serialisable game state. Only 32-bit integer ops (Math.imul, shifts) are used, which are
 * bit-exact on V8, Hermes and Deno.
 */
export type RngState = readonly [number, number, number, number];

const u32 = (n: number): number => n >>> 0;
const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

/** splitmix32, used only to expand a seed into the 128-bit state. */
function splitmix32(a: number): [number, number] {
  a = u32(a + 0x9e3779b9);
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return [u32(t), a];
}

/** Build an RNG state from a 64-bit match seed. */
export function seedRng(seed: bigint): RngState {
  const mask = 0xffffffffn;
  const lo = Number(BigInt.asUintN(64, seed) & mask);
  const hi = Number((BigInt.asUintN(64, seed) >> 32n) & mask);
  let a = u32(lo ^ Math.imul(hi, 0x85ebca6b));
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [v, next] = splitmix32(a);
    out.push(v);
    a = next;
  }
  const allZero: boolean = out.every((v) => v === 0);
  if (allZero) out[0] = 1;
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

/** Next unsigned 32-bit integer. */
export function nextU32(state: RngState): [number, RngState] {
  let [s0, s1, s2, s3] = state;
  const result = u32(Math.imul(rotl(Math.imul(s1, 5), 7), 9));
  const t = s1 << 9;
  s2 ^= s0;
  s3 ^= s1;
  s1 ^= s2;
  s0 ^= s3;
  s2 ^= t;
  s3 = rotl(s3, 11);
  return [result, [u32(s0), u32(s1), u32(s2), u32(s3)]];
}

/** Uniform integer in [0, maxExclusive) with no modulo bias. */
export function nextInt(state: RngState, maxExclusive: number): [number, RngState] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError(`maxExclusive must be an integer in 1..2^32, got ${maxExclusive}`);
  }
  const limit = 0x100000000 - (0x100000000 % maxExclusive);
  let s = state;
  for (;;) {
    const [v, next] = nextU32(s);
    s = next;
    if (v < limit) return [v % maxExclusive, s];
  }
}

/** Uniform float in [0, 1) with 32 bits of resolution. */
export function nextFloat(state: RngState): [number, RngState] {
  const [v, next] = nextU32(state);
  return [v / 0x100000000, next];
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const arr = items.slice();
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const [j, next] = nextInt(s, i + 1);
    s = next;
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return [arr, s];
}

/** Convenience stateful wrapper for code that isn't storing RNG state in game state (e.g. physics jitter). */
export class Rng {
  private state: RngState;
  constructor(seedOrState: bigint | RngState) {
    this.state = typeof seedOrState === 'bigint' ? seedRng(seedOrState) : seedOrState;
  }
  getState(): RngState {
    return this.state;
  }
  u32(): number {
    const [v, s] = nextU32(this.state);
    this.state = s;
    return v;
  }
  int(maxExclusive: number): number {
    const [v, s] = nextInt(this.state, maxExclusive);
    this.state = s;
    return v;
  }
  float(): number {
    const [v, s] = nextFloat(this.state);
    this.state = s;
    return v;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const [v, s] = shuffle(this.state, items);
    this.state = s;
    return v;
  }
}
