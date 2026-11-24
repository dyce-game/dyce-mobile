import type { StreakStatus } from '@dyce/shared';
import { saverHoursLeft, shouldPrompt, streakCopy } from './streak-logic';

const NOW = Date.parse('2026-11-24T10:00:00Z');
const status = (over: Partial<StreakStatus> = {}): StreakStatus => ({
  current: 0,
  best: 7,
  wonToday: false,
  friendsBest: null,
  lost: {
    length: 4,
    endedOn: '2026-11-23',
    brokenBy: null,
    saverAvailable: true,
    saverExpiresAt: '2026-11-24T23:00:00Z',
    seen: false,
  },
  ...over,
});

describe('the streak saver clock', () => {
  it('rounds the hours left up, and is 0 without a saver or after it', () => {
    expect(saverHoursLeft('2026-11-24T23:00:00Z', NOW)).toBe(13);
    expect(saverHoursLeft('2026-11-24T10:20:00Z', NOW)).toBe(1);
    expect(saverHoursLeft('2026-11-24T09:00:00Z', NOW)).toBe(0);
    expect(saverHoursLeft(null, NOW)).toBe(0);
  });
});

describe('when to show the screen', () => {
  it('shows a fresh loss that can still be saved, once', () => {
    expect(shouldPrompt(status(), NOW)).toBe(true);
    expect(shouldPrompt(undefined, NOW)).toBe(false);
    expect(shouldPrompt(status({ lost: null }), NOW)).toBe(false);
  });

  it('does not show one that was seen, has no saver, or whose saver ran out', () => {
    const lost = status().lost!;
    expect(shouldPrompt(status({ lost: { ...lost, seen: true } }), NOW)).toBe(false);
    expect(
      shouldPrompt(status({ lost: { ...lost, saverAvailable: false, saverExpiresAt: null } }), NOW),
    ).toBe(false);
    expect(
      shouldPrompt(status({ lost: { ...lost, saverExpiresAt: '2026-11-24T09:00:00Z' } }), NOW),
    ).toBe(false);
  });
});

describe('the words (design: StreakLost)', () => {
  it('names who broke it, offers the saver and a rematch', () => {
    const lost = {
      ...status().lost!,
      brokenBy: { id: 'a', username: 'amaka', displayName: 'Amaka', avatar: null },
    };
    const c = streakCopy(
      status({ lost, friendsBest: { username: 'zainab', displayName: 'Zainab', length: 6 } }),
      NOW,
    )!;
    expect(c.title).toBe('Streak ended at 4');
    expect(c.body).toBe('Amaka broke it. Your best is still 7 in a row.');
    expect(c.items[0]).toMatchObject({
      mark: '13h',
      title: 'Streak saver',
      detail: 'Win your next free game within 13h and the 4 comes back',
    });
    expect(c.items[1]).toMatchObject({
      title: 'Streak this week',
      detail: 'Longest among your friends: Zainab, 6',
    });
    expect(c.cta).toBe('Rematch Amaka · free');
    expect(c.alt).toBe('Not now');
  });

  it('says it plainly when nobody beat them, and when the best is the streak just lost', () => {
    const c = streakCopy(status({ best: 4 }), NOW)!;
    expect(c.body).toBe('A day went by without a win. Your best is 4 days.');
    expect(c.cta).toBe('Play a free game');
    expect(c.items).toHaveLength(1);
  });

  it('is honest when there is no saver to offer', () => {
    const lost = { ...status().lost!, saverAvailable: false, saverExpiresAt: null };
    const c = streakCopy(status({ lost }), NOW)!;
    expect(c.items[0]).toMatchObject({ tone: 'grey', title: 'No streak saver now' });
  });

  it('has nothing to say when nothing ended', () => {
    expect(streakCopy(status({ lost: null }), NOW)).toBeNull();
  });
});
