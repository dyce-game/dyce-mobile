import { poolLimitLines, poolRules, poolUsageLine } from './pool-rules-logic';

describe('Pool rules copy', () => {
  it('follows the docs where the design differs: Ð100 to Ð20,000, 60/40 or 50/30/20, top-up under Ð10,000', () => {
    const text = poolRules()
      .map((r) => `${r.title} ${r.body}`)
      .join('\n');
    expect(text).toContain('Ð100 to Ð20,000');
    expect(text).toContain('60 / 40');
    expect(text).toContain('50 / 30 / 20');
    expect(text).toContain('Ð10,000');
    expect(text).not.toContain('50,000');
    expect(text).not.toContain('70 / 30');
  });

  it('uses the limits the server reports', () => {
    const rules = poolRules({ minStakeKobo: 20_000, maxStakeKobo: 5_000_000 });
    expect(rules[0]!.body).toContain('Ð200 to Ð50,000');
    expect(poolLimitLines({ dailyGamesLimit: 12, dailyStakeLimitKobo: 5_000_000 })).toEqual([
      'Up to 12 Pool games a day',
      'Up to Ð50,000 staked a day',
    ]);
  });

  it('states the forfeit and dispute rules the server enforces', () => {
    const rules = poolRules();
    expect(rules.some((r) => /60 seconds/.test(r.body))).toBe(true);
    expect(rules.some((r) => /24 hours/.test(r.body) && /[Dd]ispute/.test(r.title + r.body))).toBe(
      true,
    );
  });

  it('reports today’s usage once it has loaded', () => {
    expect(poolUsageLine(undefined)).toBeNull();
    expect(
      poolUsageLine({
        gamesToday: 3,
        dailyGamesLimit: 20,
        stakedTodayKobo: 400_000,
        dailyStakeLimitKobo: 10_000_000,
      }),
    ).toBe('Today you have used 3 of 20 games and Ð4,000 of Ð100,000.');
  });
});
