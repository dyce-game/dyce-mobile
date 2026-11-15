import { mutualLabel, tabLabel, timeAgo } from './format';

const now = new Date('2026-11-14T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it.each([
    [0, 'just now'],
    [30_000, 'just now'],
    [MIN, '1 min ago'],
    [59 * MIN, '59 min ago'],
    [HOUR, '1 hour ago'],
    [5 * HOUR, '5 hours ago'],
    [DAY, 'yesterday'],
    [2 * DAY, '2 days ago'],
    [29 * DAY, '29 days ago'],
    [31 * DAY, '1 month ago'],
    [100 * DAY, '3 months ago'],
    [400 * DAY, '1 year ago'],
    [800 * DAY, '2 years ago'],
  ])('%i ms ago -> %s', (ms, expected) => {
    expect(timeAgo(ago(ms), now)).toBe(expected);
  });

  it('never goes negative if the device clock is behind the server', () => {
    expect(timeAgo(new Date(now.getTime() + 5 * MIN).toISOString(), now)).toBe('just now');
  });
});

describe('mutualLabel', () => {
  it('words the count, and says nothing for none', () => {
    expect(mutualLabel(0)).toBeNull();
    expect(mutualLabel(1)).toBe('1 mutual friend');
    expect(mutualLabel(3)).toBe('3 mutual friends');
  });
});

describe('tabLabel', () => {
  it('shows counts, optionally hiding a zero', () => {
    expect(tabLabel('All', 24)).toBe('All · 24');
    expect(tabLabel('All', 0)).toBe('All · 0');
    expect(tabLabel('Requests', 0, true)).toBe('Requests');
    expect(tabLabel('Requests', 3, true)).toBe('Requests · 3');
  });
});
