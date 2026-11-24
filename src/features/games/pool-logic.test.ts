import type { MatchPlayer, MatchView, PoolInfo } from '@dyce/shared';
import {
  counterChoices,
  counterLabel,
  dailyLimitHit,
  defaultStake,
  expiresIn,
  forfeitIn,
  poolIssueOf,
  poolResult,
  poolRuleLine,
  potLine,
  resetsIn,
  stakeChipLabel,
  stakeChoices,
} from './pool-logic';

const N = 100;
const ME = 'me';
const THEM = 'them';

const info = (over: Partial<PoolInfo> = {}): PoolInfo => ({
  isAdult: true,
  ageAnswered: true,
  minStakeKobo: 100 * N,
  maxStakeKobo: 20_000 * N,
  dailyStakeLimitKobo: 100_000 * N,
  stakedTodayKobo: 0,
  dailyGamesLimit: 20,
  gamesToday: 0,
  resetsInSeconds: 3600,
  ...over,
});

const player = (userId: string, over: Partial<MatchPlayer> = {}): MatchPlayer => ({
  userId,
  username: userId,
  displayName: userId,
  avatar: null,
  seat: 1,
  accepted: true,
  result: null,
  placement: null,
  stakedKobo: 1_000 * N,
  payoutKobo: null,
  ...over,
});

const finished = (over: Partial<MatchView> = {}): MatchView => ({
  id: 'm',
  gameSlug: '_example',
  gameName: 'Pig',
  mode: 'pool',
  stakeKobo: 1_000 * N,
  potKobo: 2_000 * N,
  counterStakeKobo: null,
  allowCounter: true,
  status: 'finished',
  conversationId: 'c',
  createdBy: ME,
  players: [
    player(ME, { payoutKobo: 2_000 * N, result: 'win', placement: 1 }),
    player(THEM, { seat: 2, payoutKobo: 0, result: 'loss', placement: 2 }),
  ],
  stateVersion: 3,
  currentTurn: null,
  view: null,
  outcome: { winnerIds: [ME], draw: false },
  inviteExpiresAt: null,
  createdAt: '2026-11-14T10:00:00.000Z',
  finishedAt: '2026-11-14T11:00:00.000Z',
  ...over,
});

describe('stakes', () => {
  it('offers the design presets that are inside the limits', () => {
    expect(stakeChoices(info()).map((s) => s / N)).toEqual([200, 500, 1_000, 2_000, 5_000]);
    expect(
      stakeChoices(info({ minStakeKobo: 500 * N, maxStakeKobo: 2_000 * N })).map((s) => s / N),
    ).toEqual([500, 1_000, 2_000]);
    expect(stakeChoices(undefined)).toHaveLength(5);
    // A game can ask for more than the platform minimum (Chess: ₦500).
    expect(stakeChoices(info(), 500 * N).map((s) => s / N)).toEqual([500, 1_000, 2_000, 5_000]);
    expect(stakeChoices(info(), null)).toHaveLength(5);
  });

  it('labels chips the way the design does', () => {
    expect(stakeChipLabel(200 * N)).toBe('₦200');
    expect(stakeChipLabel(1_000 * N)).toBe('₦1k');
    expect(stakeChipLabel(5_000 * N)).toBe('₦5k');
    expect(stakeChipLabel(1_500 * N)).toBe('₦1,500');
  });

  it('starts on ₦1,000 when it is on offer', () => {
    expect(defaultStake(stakeChoices(info()))).toBe(1_000 * N);
    expect(defaultStake([200 * N, 500 * N])).toBe(200 * N);
  });
});

describe('counter-offers', () => {
  it('suggests the two next smaller stakes and Free', () => {
    expect(counterChoices(1_000 * N).map((s) => s / N)).toEqual([500, 200, 0]);
    expect(counterChoices(5_000 * N).map((s) => s / N)).toEqual([2_000, 1_000, 0]);
  });

  it('only offers Free when nothing smaller is allowed', () => {
    expect(counterChoices(200 * N)).toEqual([0]);
    expect(counterChoices(500 * N, 300 * N)).toEqual([0]);
  });

  it('calls zero "Free"', () => {
    expect(counterLabel(0)).toBe('Free');
    expect(counterLabel(500 * N)).toBe('₦500');
  });
});

describe('limits and issues', () => {
  it('says which daily limit the stake would hit', () => {
    expect(dailyLimitHit(info(), 1_000 * N)).toBeNull();
    expect(dailyLimitHit(info({ stakedTodayKobo: 99_500 * N }), 1_000 * N)).toBe('stake');
    expect(dailyLimitHit(info({ gamesToday: 20 }), 100 * N)).toBe('games');
  });

  it('formats the time until the limits reset', () => {
    expect(resetsIn(4 * 3600 + 19 * 60)).toBe('4h 19m');
    expect(resetsIn(35 * 60)).toBe('35m');
    expect(resetsIn(5)).toBe('1m');
  });

  it('maps server codes to the issue screens', () => {
    expect(poolIssueOf('insufficient_funds')).toBe('low-balance');
    expect(poolIssueOf('over_pool_stake_limit')).toBe('limit');
    expect(poolIssueOf('over_pool_games_limit')).toBe('limit');
    expect(poolIssueOf('adult_required')).toBeNull();
    expect(poolIssueOf(undefined)).toBeNull();
  });
});

describe('the card', () => {
  it('shows the pot for Pool only', () => {
    const base = { counterStakeKobo: null, status: 'active' } as const;
    const pool = { ...base, mode: 'pool', stakeKobo: 1_000 * N, potKobo: 2_000 * N } as const;
    expect(potLine(pool)).toBe('Pot ₦2,000 · locked until the game ends');
    expect(potLine({ ...pool, status: 'finished' })).toBe('Pot ₦2,000');
    expect(potLine({ ...pool, status: 'cancelled' })).toBeNull();
    expect(potLine({ ...pool, status: 'countered', counterStakeKobo: 500 * N })).toBe(
      'Pot ₦1,000 if accepted',
    );
    expect(potLine({ ...pool, status: 'countered', counterStakeKobo: 0 })).toBeNull();
    expect(potLine({ ...base, mode: 'free', stakeKobo: 0, potKobo: 0 })).toBeNull();
  });

  it('counts down to the expiry in hours and minutes', () => {
    const now = new Date('2026-11-14T10:00:00Z').getTime();
    expect(expiresIn('2026-11-15T09:19:00Z', now)).toBe('23:19');
    expect(expiresIn('2026-11-14T09:00:00Z', now)).toBeNull();
    expect(expiresIn(null, now)).toBeNull();
  });
});

describe('poolResult', () => {
  it('shows a win as the net gain with the pot and your balance', () => {
    const r = poolResult(finished(), ME, 'Tunde', 201_000 * N)!;
    expect(r.outcome).toBe('won');
    expect(r.amount).toBe('+₦1,000');
    expect(r.lines).toEqual([
      { label: 'Pot', value: '₦2,000' },
      { label: 'Your stake back', value: '₦1,000' },
      { label: "Tunde's stake", value: '₦1,000' },
      { label: 'Dyce fee', value: '₦0' },
      { label: 'New balance', value: '₦201,000' },
    ]);
  });

  it('shows a loss as your stake, paid to the winner', () => {
    const lost = finished({
      outcome: { winnerIds: [THEM], draw: false },
      players: [
        player(ME, { payoutKobo: 0, result: 'loss', placement: 2 }),
        player(THEM, { seat: 2, payoutKobo: 2_000 * N, result: 'win', placement: 1 }),
      ],
    });
    const r = poolResult(lost, ME, 'Tunde', 199_000 * N)!;
    expect(r.outcome).toBe('lost');
    expect(r.amount).toBe('−₦1,000');
    expect(r.lines.map((l) => l.value)).toEqual(['₦1,000', '₦2,000 pot', '₦199,000']);
  });

  it('shows a draw as a split pot with both stakes back', () => {
    const draw = finished({
      outcome: { winnerIds: [], draw: true },
      players: [
        player(ME, { payoutKobo: 1_000 * N, result: 'draw', placement: 1 }),
        player(THEM, { seat: 2, payoutKobo: 1_000 * N, result: 'draw', placement: 1 }),
      ],
    });
    const r = poolResult(draw, ME, 'Tunde', null)!;
    expect(r.outcome).toBe('draw');
    expect(r.amount).toBe('Pot split');
    expect(r.lines).toEqual([
      { label: 'Back to you', value: '₦1,000' },
      { label: 'Back to Tunde', value: '₦1,000' },
    ]);
  });

  it('is null for Free matches and unfinished ones', () => {
    expect(poolResult(finished({ mode: 'free' }), ME, 'Tunde', 0)).toBeNull();
    expect(poolResult(finished({ status: 'active' }), ME, 'Tunde', 0)).toBeNull();
  });
});

describe('the Pool rule line and the forfeit clock', () => {
  it('says what the pot does in plain words', () => {
    expect(poolRuleLine(1_000 * N)).toBe(
      'Winner takes ₦2,000. A draw refunds both. No reply in 24 hours refunds you. No move for 24 hours is a forfeit.',
    );
  });

  it('counts down to a forfeit, and says nothing without a clock or after it', () => {
    const now = Date.parse('2026-11-24T10:00:00Z');
    expect(forfeitIn('2026-11-25T09:10:00Z', now)).toBe('23h 10m');
    expect(forfeitIn('2026-11-24T10:20:00Z', now)).toBe('20m');
    expect(forfeitIn('2026-11-24T09:59:00Z', now)).toBeNull();
    expect(forfeitIn(null, now)).toBeNull();
    expect(forfeitIn(undefined, now)).toBeNull();
  });
});
