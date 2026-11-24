import type { MatchView } from '@dyce/shared';
import {
  canResign,
  isNetworkFailure,
  offlineCopy,
  opponentIssueCopy,
  reportOpponentHref,
  resignCopy,
  tableOfflineCopy,
} from './games-edge-logic';

const player = (userId: string, username: string) => ({
  userId,
  username,
  displayName: username,
  avatar: null,
  seat: 1,
  accepted: true,
  result: null,
  placement: null,
  stakedKobo: 0,
  payoutKobo: null,
});

const match = (over: Partial<MatchView> = {}) =>
  ({
    id: 'm1',
    gameSlug: 'chess',
    gameName: 'Chess',
    mode: 'free',
    stakeKobo: 0,
    potKobo: 0,
    status: 'active',
    conversationId: 'c1',
    players: [player('me', 'kemdi'), player('them', 'amaka')],
    ...over,
  }) as unknown as MatchView;

describe('resigning', () => {
  it('is for a running two-player game you are in', () => {
    expect(canResign(match(), 'me')).toBe(true);
    expect(canResign(match({ status: 'invited' }), 'me')).toBe(false);
    expect(canResign(match({ status: 'finished' }), 'me')).toBe(false);
    expect(canResign(match(), 'stranger')).toBe(false);
    expect(
      canResign(match({ players: [player('me', 'a'), player('b', 'b'), player('c', 'c')] }), 'me'),
    ).toBe(false);
  });

  it('states the Pool consequence in kobo-exact naira', () => {
    const c = resignCopy(match({ mode: 'pool', stakeKobo: 100_000, potKobo: 200_000 }), 'Amaka');
    expect(c.body).toBe(
      'Amaka wins and takes the Ð2,000 pot. You lose your Ð1,000 stake. This can’t be undone.',
    );
    expect(c.chip).toBe('Ð2,000 at stake');
    expect(c.confirm).toBe('Resign and lose Ð1,000');
    expect(c.menuLabel).toBe('Resign and lose Ð1,000');
  });

  it('says nothing moves in a Free game', () => {
    const c = resignCopy(match(), 'Amaka');
    expect(c.chip).toBeNull();
    expect(c.body).toContain('No Dyce Cash moves');
    expect(c.confirm).toBe('Resign');
  });
});

describe('connection states', () => {
  it('recognises an unreachable server and nothing else', () => {
    expect(isNetworkFailure({ status: 0, code: 'network' })).toBe(true);
    expect(isNetworkFailure({ code: 'network' })).toBe(true);
    expect(isNetworkFailure({ status: 409, code: 'stale_version' })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure(new Error('x'))).toBe(false);
  });

  it('never invents a countdown for an async game', () => {
    const c = offlineCopy(match({ mode: 'pool', potKobo: 200_000 }));
    expect(c.chip).toBe('Ð2,000 pot is safe');
    expect(c.body).not.toMatch(/\d+ seconds|grace/i);
    expect(offlineCopy(match()).chip).toBeNull();
  });

  it('gives the live table the 60 seconds the server really keeps a seat for', () => {
    expect(tableOfflineCopy(0).body).toContain('60 seconds');
    expect(tableOfflineCopy(0).chip).toBeNull();
    expect(tableOfflineCopy(200_000).chip).toBe('Ð2,000 pot');
  });

  it('names who lost connection', () => {
    expect(opponentIssueCopy(['Amaka'], 0).title).toBe('Amaka lost connection');
    expect(opponentIssueCopy(['Amaka', 'Bayo'], 50_000).title).toBe(
      'Amaka and Bayo lost connection',
    );
    expect(opponentIssueCopy(['A', 'B', 'C'], 0).title).toBe('A few players lost connection');
    expect(opponentIssueCopy(['Amaka'], 50_000).chip).toBe('Ð500 pot is safe');
  });
});

describe('report from the menu', () => {
  it('opens the Report screen for the opponent, with this chat attached', () => {
    const href = reportOpponentHref(match(), 'me')!;
    expect(href.startsWith('/report?')).toBe(true);
    expect(href).toContain('userId=them');
    expect(href).toContain('username=amaka');
    expect(href).toContain('conversationId=c1');
  });
});
