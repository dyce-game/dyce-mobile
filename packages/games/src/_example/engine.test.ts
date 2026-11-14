import { describeEngine } from '../testing/engineHarness.ts';
import { pigEngine, pigActionSchema, type PigAction } from './engine.ts';

const cfg = { target: 30 };

describeEngine(pigEngine, {
  playerCounts: [2, 3, 4],
  cfg,
  candidates: (): PigAction[] => [{ kind: 'roll' }, { kind: 'hold' }],
  illegal: (s, by): PigAction[] => {
    // Holding with nothing banked is illegal; acting out of turn is always illegal.
    const out: PigAction[] = [];
    if (s.winner !== null) return [{ kind: 'roll' }, { kind: 'hold' }];
    if (s.players[s.turn] !== by) out.push({ kind: 'roll' }, { kind: 'hold' });
    else if (s.turnPoints === 0) out.push({ kind: 'hold' });
    return out;
  },
});

describe('pig rules', () => {
  it('a roll of 1 loses the turn total and passes the turn', () => {
    // Find a seed whose first roll is a 1 to pin the behaviour.
    for (let seed = 0n; seed < 200n; seed++) {
      const s0 = pigEngine.init(['a', 'b'], seed, cfg);
      const s1 = pigEngine.apply(s0, 'a', { kind: 'roll' });
      if (s1.lastRoll === 1) {
        expect(s1.turnPoints).toBe(0);
        expect(pigEngine.currentPlayers(s1)).toEqual(['b']);
        return;
      }
    }
    throw new Error('No seed in 0..199 produced a 1; RNG looks broken');
  });

  it('rejects out-of-turn and hold-with-nothing', () => {
    const s = pigEngine.init(['a', 'b'], 1n, cfg);
    expect(pigEngine.validate(s, 'b', { kind: 'roll' })).toEqual({
      ok: false,
      code: 'not_your_turn',
    });
    expect(pigEngine.validate(s, 'a', { kind: 'hold' })).toEqual({
      ok: false,
      code: 'nothing_to_hold',
    });
  });

  it('never exposes the RNG state through view()', () => {
    const s = pigEngine.init(['a', 'b'], 1n, cfg);
    expect(pigEngine.view(s, 'a')).not.toHaveProperty('rng');
    expect(pigEngine.view(s, 'spectator')).not.toHaveProperty('rng');
  });

  it('validates wire actions with the zod schema', () => {
    expect(pigActionSchema.safeParse({ kind: 'roll' }).success).toBe(true);
    expect(pigActionSchema.safeParse({ kind: 'cheat' }).success).toBe(false);
  });

  it('declares a winner at the target', () => {
    let s = pigEngine.init(['a', 'b'], 7n, { target: 1 });
    for (let i = 0; i < 100 && !pigEngine.isTerminal(s); i++) {
      const by = pigEngine.currentPlayers(s)[0]!;
      const act: PigAction = pigEngine.validate(s, by, { kind: 'hold' }).ok
        ? { kind: 'hold' }
        : { kind: 'roll' };
      s = pigEngine.apply(s, by, act);
    }
    expect(pigEngine.isTerminal(s)).toBe(true);
    expect(pigEngine.result(s).placements[0]).toHaveLength(1);
  });
});
