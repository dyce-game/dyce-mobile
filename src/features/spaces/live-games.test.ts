import { LIVE_GAMES } from '@dyce/games';
import { CREATE_GAMES, buildOptions, createGame, gameLine } from './live-games';

describe('the games a host can open', () => {
  it('lists every live game with the server’s own limits', () => {
    expect(CREATE_GAMES.map((g) => g.slug)).toEqual([
      'whot',
      'crazy-cards',
      'imposter',
      'werewolf',
      'charades',
      'doodle-guess',
    ]);
    for (const g of CREATE_GAMES) {
      const live = LIVE_GAMES[g.slug]!;
      expect([g.minSeats, g.maxSeats]).toEqual([live.minPlayers, live.maxPlayers]);
      expect(g.defaultSeats).toBeGreaterThanOrEqual(g.minSeats);
      expect(g.defaultSeats).toBeLessThanOrEqual(g.maxSeats);
      expect(g.schemes).toBe(live.payoutSchemes);
    }
  });

  it('side games offer winner takes all only', () => {
    expect(createGame('imposter').schemes).toEqual(['winner_all']);
    expect(createGame('werewolf').sidesWin).toBe(true);
    expect(createGame('doodle-guess').schemes).toContain('p50_30_20');
  });

  it('describes a game in one line', () => {
    expect(gameLine(createGame('whot'))).toBe('2–4 players · Nigerian card game');
    expect(gameLine(createGame('werewolf'))).toMatch(/^5–12 players/);
  });
});

describe('buildOptions', () => {
  it('sends only what changed from the default, and nothing for a game without options', () => {
    const charades = createGame('charades');
    expect(buildOptions(charades, {})).toBeUndefined();
    expect(buildOptions(charades, { mode: 'act' })).toBeUndefined();
    expect(buildOptions(charades, { mode: 'headsup' })).toEqual({ mode: 'headsup' });
    expect(buildOptions(createGame('imposter'), { clueRounds: 3 })).toEqual({ clueRounds: 3 });
    expect(buildOptions(createGame('whot'), { rounds: 5 })).toBeUndefined();
  });
  it('never produces options the server would refuse', () => {
    for (const g of CREATE_GAMES) {
      for (const spec of g.options) {
        for (const c of spec.choices) {
          const o = buildOptions(g, { [spec.key]: c.value });
          if (o) expect(LIVE_GAMES[g.slug]!.optionsValid(o)).toBe(true);
        }
      }
    }
  });
});
