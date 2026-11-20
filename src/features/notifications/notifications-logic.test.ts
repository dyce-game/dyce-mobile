import type { NotificationItem } from '@dyce/shared';
import { actorName, badgeLabel, groupByDay, kindTag, timeAgo } from './notifications-logic';

const NOW = new Date(2026, 10, 19, 15, 0, 0); // Thursday 19 Nov 2026, 15:00 local
const at = (d: Date) => d.toISOString();
const item = (id: string, created: Date): NotificationItem => ({
  id,
  kind: 'your_turn',
  actor: null,
  payload: {},
  createdAt: at(created),
  read: false,
});

describe('timeAgo', () => {
  it('reads like a chat list', () => {
    expect(timeAgo(at(new Date(2026, 10, 19, 14, 59, 40)), NOW)).toBe('now');
    expect(timeAgo(at(new Date(2026, 10, 19, 14, 58, 0)), NOW)).toBe('2m');
    expect(timeAgo(at(new Date(2026, 10, 19, 12, 0, 0)), NOW)).toBe('3h');
    expect(timeAgo(at(new Date(2026, 10, 18, 23, 0, 0)), NOW)).toBe('Yesterday');
    expect(timeAgo(at(new Date(2026, 10, 17, 9, 0, 0)), NOW)).toMatch(/^[A-Z][a-z]{2}$/);
    expect(timeAgo(at(new Date(2026, 9, 2, 9, 0, 0)), NOW)).toBe('2 Oct');
  });
});

describe('groupByDay', () => {
  it('splits today from earlier and drops empty sections', () => {
    const items = [
      item('a', new Date(2026, 10, 19, 14, 0)),
      item('b', new Date(2026, 10, 18, 9, 0)),
    ];
    expect(groupByDay(items, NOW).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Earlier', ['b']],
    ]);
    expect(groupByDay([items[1]!], NOW).map((g) => g.label)).toEqual(['Earlier']);
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('small helpers', () => {
  it('names the other person and caps badges', () => {
    expect(actorName(null)).toBeNull();
    expect(actorName({ id: '1', username: 'amaka', displayName: 'Amaka B', avatar: null })).toBe(
      'Amaka B',
    );
    expect(actorName({ id: '1', username: 'amaka', displayName: '', avatar: null })).toBe('@amaka');
    expect(badgeLabel(4)).toBe('4');
    expect(badgeLabel(12)).toBe('9+');
  });
  it('gives every kind a tag', () => {
    expect(kindTag('pool_result').mark).toBe('₦');
    expect(kindTag('friend_request').mark).toBe('+');
  });
});
