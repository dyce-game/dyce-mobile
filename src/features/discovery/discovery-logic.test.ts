import type { HeadToHead, UserProfile } from '@dyce/shared';
import {
  behindNote,
  boardValue,
  headToHeadLast,
  headToHeadShare,
  mutualLabel,
  profileAction,
  resetsIn,
  winRateLabel,
} from './discovery-logic';

const h2h = (o: Partial<HeadToHead> = {}): HeadToHead => ({
  wins: 0,
  losses: 0,
  draws: 0,
  last: null,
  ...o,
});
const m = (names: string[], count = names.length): UserProfile['mutualFriends'] => ({
  count,
  sample: names.map((n, i) => ({ id: String(i), username: n, displayName: n, avatar: null })),
});

describe('profile text', () => {
  it('shows a dash before anyone has played', () => {
    expect(winRateLabel(null)).toBe('—');
    expect(winRateLabel(0.625)).toBe('63%');
  });

  it('words the last head-to-head game with money only for Pool', () => {
    expect(headToHeadLast(h2h())).toBeNull();
    const last = {
      gameSlug: 'x',
      gameName: 'Sea Battle',
      mode: 'pool' as const,
      result: 'loss' as const,
      netKobo: -100_000,
      at: '',
    };
    expect(headToHeadLast(h2h({ last }))).toBe('Last: Sea Battle pool · you lost ₦1,000');
    expect(
      headToHeadLast(h2h({ last: { ...last, mode: 'free', result: 'win', netKobo: null } })),
    ).toBe('Last: Sea Battle · you won');
  });

  it('splits the bar by wins and starts level', () => {
    expect(headToHeadShare(h2h())).toBe(50);
    expect(headToHeadShare(h2h({ wins: 3, losses: 1 }))).toBe(75);
    expect(headToHeadShare(h2h({ losses: 2 }))).toBe(0);
  });

  it('names a few mutual friends', () => {
    expect(mutualLabel(m([]))).toBeNull();
    expect(mutualLabel(m(['Ada']))).toBe('1 mutual friend: Ada');
    expect(mutualLabel(m(['Ada', 'Tunde']))).toBe('2 mutual friends: Ada and Tunde');
    expect(mutualLabel(m(['Ada', 'Tunde', 'Ife'], 4))).toBe(
      '4 mutual friends: Ada, Tunde, Ife and 1 more',
    );
  });

  it('picks the friend button from the relationship and their settings', () => {
    expect(profileAction('none', true)).toEqual({ kind: 'add' });
    expect(profileAction('none', false)).toEqual({ kind: 'closed' });
    expect(profileAction('pending_out', true)).toEqual({ kind: 'requested' });
    expect(profileAction('pending_in', false)).toEqual({ kind: 'accept' });
    expect(profileAction('friends', false)).toEqual({ kind: 'none' });
    expect(profileAction('self', false)).toEqual({ kind: 'none' });
  });
});

describe('leaderboard text', () => {
  it('counts down to Monday', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    expect(resetsIn('2026-11-22T23:00:00Z', now)).toBe('Resets Monday · 3d 13h');
    expect(resetsIn('2026-11-19T12:30:00Z', now)).toBe('Resets Monday · 2h 30m');
    expect(resetsIn('2026-11-19T09:00:00Z', now)).toBe('Resets now');
  });

  it('formats XP and Pool values', () => {
    expect(boardValue('xp', 1640)).toMatch(/^1[,.]?640 XP$/);
    expect(boardValue('pool', 1_250_000)).toBe('+₦12.5k');
    expect(boardValue('pool', -200_000)).toBe('−₦2,000');
  });

  it('says how far behind the person above you are', () => {
    const above = { value: 640, displayName: 'Zainab', username: 'z' };
    expect(behindNote('xp', { value: 570, rank: 2 }, above)).toBe('70 XP behind Zainab');
    expect(behindNote('xp', { value: 640, rank: 2 }, above)).toBe('Level with Zainab');
    expect(behindNote('xp', { value: 640, rank: 1 }, null)).toBe('You lead this week');
    expect(behindNote('xp', null, null)).toBeNull();
  });
});
