import type { SpaceMember, SpaceView } from '@dyce/shared';
import {
  lobbyAction,
  modeLine,
  netKobo,
  newerSpace,
  ordinal,
  payoutSplit,
  prizeText,
  schemesFor,
  seatFeeChoices,
  spaceMeta,
} from './spaces-logic';

const member = (o: Partial<SpaceMember> = {}): SpaceMember => ({
  userId: 'u',
  username: 'u',
  displayName: 'U',
  avatar: null,
  seat: 1,
  isHost: false,
  stakedKobo: 0,
  placement: null,
  result: null,
  payoutKobo: null,
  ...o,
});

const space = (o: Partial<SpaceView> = {}): SpaceView => ({
  id: 's',
  code: 'DY-4K9P',
  name: 'Night',
  hostId: 'h',
  gameSlug: 'whot',
  gameName: 'Whot!',
  mode: 'free',
  seatFeeKobo: 0,
  potKobo: 0,
  payoutScheme: 'winner_all',
  maxSeats: 4,
  minSeats: 2,
  visibility: 'friends',
  startRule: 'host',
  status: 'waiting',
  members: [member({ userId: 'h', isHost: true })],
  matchId: 'm',
  seated: true,
  hosting: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...o,
});

describe('payoutSplit', () => {
  it('matches the database: floors, the remainder to first place', () => {
    expect(payoutSplit(150_000, 'p50_30_20', 3).map((p) => p.kobo)).toEqual([
      75_000, 45_000, 30_000,
    ]);
    expect(payoutSplit(100_001, 'p50_30_20', 3).map((p) => p.kobo)).toEqual([
      50_001, 30_000, 20_000,
    ]);
    expect(payoutSplit(100_000, 'winner_all', 4)).toEqual([{ place: 1, kobo: 100_000 }]);
    expect(payoutSplit(100_000, 'p60_40', 2).map((p) => p.kobo)).toEqual([60_000, 40_000]);
  });

  it('two players who picked 50/30/20 are paid 60/40; more seats than places leave the rest unpaid', () => {
    expect(payoutSplit(100_000, 'p50_30_20', 2).map((p) => p.kobo)).toEqual([60_000, 40_000]);
    expect(payoutSplit(100_000, 'p50_30_20', 4)).toHaveLength(3);
  });

  it('always pays out exactly the pot', () => {
    for (const pot of [1, 99, 100_000, 123_457, 7_777_777]) {
      for (const [scheme, n] of [
        ['p50_30_20', 3],
        ['p50_30_20', 4],
        ['p60_40', 2],
        ['winner_all', 3],
      ] as const) {
        expect(payoutSplit(pot, scheme, n).reduce((a, b) => a + b.kobo, 0)).toBe(pot);
      }
    }
  });
});

describe('create options', () => {
  it('offers the seat fees inside the limits and the schemes that fit the seats', () => {
    expect(seatFeeChoices(undefined)).toEqual([20_000, 50_000, 100_000, 200_000]);
    expect(seatFeeChoices({ minStakeKobo: 50_000, maxStakeKobo: 100_000 })).toEqual([
      50_000, 100_000,
    ]);
    expect(schemesFor(2)).toEqual(['winner_all', 'p60_40']);
    expect(schemesFor(4)).toEqual(['winner_all', 'p60_40', 'p50_30_20']);
  });
});

describe('words', () => {
  it('describes a space', () => {
    expect(spaceMeta(space())).toBe('Whot! · 1 of 4 seated');
    expect(spaceMeta(space({ status: 'live' }))).toBe('Whot! · 1 playing');
    expect(modeLine(space())).toBe('Free');
    expect(modeLine(space({ mode: 'pool', seatFeeKobo: 50_000, payoutScheme: 'p50_30_20' }))).toBe(
      'Pool · ₦500 a seat · 50 / 30 / 20',
    );
    expect([1, 2, 3, 4].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th']);
  });

  it('the lobby button follows who you are and how many are seated', () => {
    expect(lobbyAction(space())).toMatchObject({ label: 'Waiting for 1 more', enabled: false });
    const two = space({ members: [member({ userId: 'h' }), member({ userId: 'b' })] });
    expect(lobbyAction(two)).toMatchObject({ label: 'Start with 2 players', enabled: true });
    expect(lobbyAction({ ...two, hosting: false })).toMatchObject({ enabled: false });
    expect(lobbyAction({ ...two, hosting: false, startRule: 'when_full' }).hint).toMatch(
      /every seat/,
    );
  });

  it('result rows say prize or loss; net is payout minus what was put in', () => {
    const pool = { mode: 'pool', seatFeeKobo: 50_000 } as const;
    expect(prizeText(pool, member({ payoutKobo: 75_000, stakedKobo: 50_000 }))).toBe('₦750');
    expect(prizeText(pool, member({ payoutKobo: 0, stakedKobo: 50_000 }))).toBe('−₦500');
    expect(prizeText({ mode: 'free', seatFeeKobo: 0 }, member({ placement: 1 }))).toBe('Winner');
    expect(netKobo({ payoutKobo: 75_000, stakedKobo: 50_000 })).toBe(25_000);
    expect(netKobo({ payoutKobo: 0, stakedKobo: 50_000 })).toBe(-50_000);
  });
});

describe('newerSpace', () => {
  it('a later phase replaces an earlier one, never the other way round', () => {
    const waiting = space();
    const live = space({ status: 'live' });
    expect(newerSpace(undefined, waiting)).toBe(waiting);
    expect(newerSpace(waiting, live)).toBe(live);
    expect(newerSpace(live, waiting)).toBe(live);
    const ended = space({ status: 'ended' });
    expect(newerSpace(live, ended)).toBe(ended);
  });
});
