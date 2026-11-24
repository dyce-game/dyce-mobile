import type { LiveState, SpaceMember } from '@dyce/shared';
import { isLudoRoom, ludoSeatLine, ludoTableMembers } from './ludo-table-logic';

const member = (userId: string, seat: number, name = userId): SpaceMember => ({
  userId,
  username: userId,
  displayName: name,
  avatar: null,
  seat,
  isHost: seat === 1,
  stakedKobo: 0,
  placement: null,
  result: null,
  payoutKobo: null,
});
const seat = (userId: string, seatNo: number, over: Partial<LiveState['seats'][number]> = {}) => ({
  userId,
  seat: seatNo,
  connected: true,
  forfeited: false,
  ...over,
});
const live = (over: Partial<LiveState> = {}) => ({
  status: 'live' as const,
  turnUserId: 'b',
  seats: [seat('a', 1), seat('b', 2), seat('c', 3)],
  ...over,
});

describe('the Ludo room table', () => {
  it('knows its slug', () => {
    expect(isLudoRoom('ludo-room')).toBe(true);
    expect(isLudoRoom('ludo')).toBe(false);
    expect(isLudoRoom('whot')).toBe(false);
  });

  it('lists the seated members in seat order', () => {
    const space = { members: [member('c', 3), member('a', 1), member('b', 2), member('z', 4)] };
    expect(ludoTableMembers(space, live()).map((m) => m.userId)).toEqual(['a', 'b', 'c']);
  });

  it('says who is on the clock, with the seconds', () => {
    const l = live();
    expect(ludoSeatLine(member('b', 2, 'Bola'), l, 'a', 18)).toMatchObject({
      label: 'Bola',
      note: 'Their turn · 18s',
      onTurn: true,
      spoken: 'Bola, Their turn · 18s',
    });
    expect(ludoSeatLine(member('b', 2), live({ turnUserId: 'b' }), 'b', null)).toMatchObject({
      label: 'You',
      note: 'Your turn',
    });
    expect(ludoSeatLine(member('c', 3), l, 'a', 18)).toMatchObject({ note: null, onTurn: false });
  });

  it('says when a seat left or lost its connection, and nothing once the game is over', () => {
    const gone = live({
      seats: [seat('a', 1), seat('b', 2, { forfeited: true }), seat('c', 3, { connected: false })],
    });
    expect(ludoSeatLine(member('b', 2), gone, 'a', 5)).toMatchObject({
      note: 'Left',
      onTurn: false,
    });
    expect(ludoSeatLine(member('c', 3), gone, 'a', 5)).toMatchObject({ note: 'Offline' });
    const over = live({ status: 'finished' as never });
    expect(ludoSeatLine(member('b', 2), over, 'a', 5)).toMatchObject({ note: null, onTurn: false });
  });
});
