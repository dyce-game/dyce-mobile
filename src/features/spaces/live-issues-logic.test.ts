import type { LiveState } from '@dyce/shared';
import { liveIssue, sameIssue } from './live-issues-logic';

const seat = (userId: string, connected: boolean, forfeited = false) => ({
  userId,
  seat: 1,
  connected,
  forfeited,
});
const table = (over: Partial<LiveState> = {}) =>
  ({
    status: 'live',
    waiting: false,
    seats: [seat('me', true), seat('a', true), seat('b', true)],
    ...over,
  }) as unknown as LiveState;

describe('live table connection issues', () => {
  it('is nothing while everyone is connected, or before the first table arrives', () => {
    expect(liveIssue(table(), 'live', 'me')).toBeNull();
    expect(liveIssue(null, 'reconnecting', 'me')).toBeNull();
  });

  it('is "offline" when your own line dropped, even if others look fine', () => {
    expect(liveIssue(table(), 'reconnecting', 'me')).toEqual({ kind: 'offline' });
  });

  it('names the others who are away, but not the ones who already forfeited', () => {
    const t = table({ seats: [seat('me', true), seat('a', false), seat('b', false, true)] });
    expect(liveIssue(t, 'live', 'me')).toEqual({ kind: 'others', userIds: ['a'] });
  });

  it('never counts yourself, and treats a party table that is still gathering as waiting', () => {
    expect(
      liveIssue(table({ seats: [seat('me', false), seat('a', true)] }), 'live', 'me'),
    ).toBeNull();
    const gathering = table({ waiting: true, seats: [seat('me', true), seat('a', false)] });
    expect(liveIssue(gathering, 'live', 'me')).toBeNull();
  });

  it('shows nothing once the table has finished', () => {
    expect(liveIssue(table({ status: 'finished' }), 'reconnecting', 'me')).toBeNull();
  });

  it('compares issues so a dismissed card comes back only when it is different', () => {
    expect(sameIssue({ kind: 'offline' }, { kind: 'offline' })).toBe(true);
    expect(sameIssue(null, null)).toBe(true);
    expect(sameIssue(null, { kind: 'offline' })).toBe(false);
    expect(
      sameIssue({ kind: 'others', userIds: ['a'] }, { kind: 'others', userIds: ['a', 'b'] }),
    ).toBe(false);
    expect(sameIssue({ kind: 'others', userIds: ['a'] }, { kind: 'others', userIds: ['a'] })).toBe(
      true,
    );
  });
});
