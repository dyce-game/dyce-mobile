import type { QuickMatchTicket } from '@dyce/shared';
import {
  acceptSecondsLeft,
  clock,
  endedText,
  isEnded,
  isOpen,
  lookingText,
  modeText,
  opponentLine,
} from './quick-match-logic';

const ticket = (over: Partial<QuickMatchTicket> = {}): QuickMatchTicket => ({
  id: 't',
  status: 'searching',
  gameSlug: 'whot',
  gameName: 'Whot!',
  mode: 'free',
  stakeKobo: 0,
  createdAt: '2026-11-20T10:00:00Z',
  searchEndsAt: '2026-11-20T10:01:00Z',
  acceptBy: null,
  accepted: false,
  opponent: null,
  spaceId: null,
  lookingCount: 1,
  errorCode: null,
  ...over,
});

describe('quick match logic', () => {
  it('knows open and ended searches', () => {
    expect(isOpen(ticket())).toBe(true);
    expect(isOpen(ticket({ status: 'found' }))).toBe(true);
    expect(isOpen(ticket({ status: 'playing' }))).toBe(false);
    expect(isOpen(null)).toBe(false);
    for (const s of ['cancelled', 'expired', 'declined', 'missed', 'failed'] as const)
      expect(isEnded(ticket({ status: s }))).toBe(true);
    expect(isEnded(ticket({ status: 'playing' }))).toBe(false);
  });

  it('counts the accept window down from when the match was seen, never below zero', () => {
    expect(acceptSecondsLeft(1000, 1000)).toBe(10);
    expect(acceptSecondsLeft(1000, 1999)).toBe(10);
    expect(acceptSecondsLeft(1000, 4500)).toBe(7);
    expect(acceptSecondsLeft(1000, 99_000)).toBe(0);
    expect(clock(9)).toBe('0:09');
    expect(clock(70)).toBe('1:10');
  });

  it('describes the opponent and the stake', () => {
    const o = {
      userId: 'u',
      username: 'x',
      displayName: 'X',
      avatar: null,
      level: 14,
      winRatePct: 62,
      games: 40,
    };
    expect(opponentLine(ticket({ opponent: o }))).toBe('Level 14 · 62% wins');
    expect(opponentLine(ticket({ opponent: { ...o, winRatePct: null, games: 0 } }))).toBe(
      'Level 14 · New here',
    );
    expect(opponentLine(ticket())).toBe('');
    expect(modeText(ticket())).toBe('Free');
    expect(modeText(ticket({ mode: 'pool', stakeKobo: 50_000 }))).toBe(
      'Pool · Ð500 each · winner takes Ð1,000',
    );
  });

  it('says why a search ended, and reassures about money', () => {
    expect(endedText(ticket({ status: 'expired' }))).toMatch(/No one was found/);
    expect(endedText(ticket({ status: 'missed', mode: 'pool' }))).toMatch(/stake is back/);
    expect(endedText(ticket({ status: 'missed' }))).toBe('The match timed out.');
    expect(endedText(ticket({ status: 'failed', errorCode: 'insufficient_funds' }))).toMatch(
      /enough Dyce Cash/,
    );
    expect(endedText(ticket({ status: 'failed', errorCode: 'weird' }))).toMatch(
      /Nothing was taken/,
    );
    expect(endedText(ticket({ status: 'cancelled' }))).toBeNull();
  });

  it('counts the people looking', () => {
    expect(lookingText(1)).toMatch(/first/);
    expect(lookingText(382)).toBe('382 people looking');
  });
});
