import type { SpaceView } from '@dyce/shared';
import { problemForJoinError, problemForSpace, spaceProblem } from './space-problem-logic';

const space = (over: Partial<SpaceView> = {}) =>
  ({
    id: 's1',
    name: 'Sunday Game Night',
    status: 'waiting',
    mode: 'pool',
    seated: false,
    exit: null,
    ...over,
  }) as unknown as SpaceView;

describe('space edge states', () => {
  it('says the host closed it and that the seat fee came back, in the server’s numbers', () => {
    const p = problemForSpace(
      space({
        status: 'closed',
        exit: { reason: 'host_closed', hostName: 'Ifeoma', refundedKobo: 50_000 },
      }),
    )!;
    expect(p.kind).toBe('host_closed');
    expect(p.title).toBe('The host closed the space');
    expect(p.body).toContain('Ifeoma ended the space');
    expect(p.money).toBe('Ð500 refunded to your wallet');
  });

  it('says nothing was charged in a Free space', () => {
    const p = problemForSpace(
      space({
        mode: 'free',
        status: 'closed',
        exit: { reason: 'host_closed', hostName: 'Ifeoma', refundedKobo: 0 },
      }),
    )!;
    expect(p.money).toBe('Nothing was charged');
  });

  it('says you were removed and what you got back', () => {
    const p = problemForSpace(
      space({ exit: { reason: 'removed', hostName: 'Tolu', refundedKobo: 30_000 } }),
    )!;
    expect(p.title).toBe('You were removed');
    expect(p.money).toBe('Your Ð300 entry was refunded');
  });

  it('says a space timed out when nobody started it', () => {
    const p = problemForSpace(
      space({ status: 'closed', exit: { reason: 'expired', hostName: 'Tolu', refundedKobo: 0 } }),
    )!;
    expect(p.title).toBe('This space timed out');
  });

  it('is not an edge state while you are seated', () => {
    expect(problemForSpace(space({ seated: true }))).toBeNull();
  });

  it('falls back to "closed" when an older server sent no reason, and "left" otherwise', () => {
    expect(problemForSpace(space({ status: 'closed' }))!.kind).toBe('host_closed');
    expect(problemForSpace(space({ status: 'waiting' }))!.kind).toBe('left');
  });

  it('turns a failed join into the full or removed screen, and nothing for other errors', () => {
    const full = problemForJoinError('space_full', { name: 'Tiny', seats: 2 })!;
    expect(full.kind).toBe('full');
    expect(full.glyph).toBe('2/2');
    expect(full.body).toContain('in Tiny');
    expect(full.money).toBe('Nothing was charged');
    expect(problemForJoinError('space_removed')!.kind).toBe('removed');
    expect(problemForJoinError('insufficient_funds')).toBeNull();
    expect(spaceProblem('full').glyph).toBe('Full');
  });
});
