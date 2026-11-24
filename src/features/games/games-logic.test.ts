import type { GameCardPayload, GameInfo, MatchView } from '@dyce/shared';
import {
  canFetchMatch,
  cardLabel,
  cardState,
  categoryChips,
  describeLastRoll,
  filterGames,
  gameMeta,
  newerCard,
  newerMatch,
  opponentOf,
  parsePigView,
  resultCopy,
  scoreLine,
  type PigView,
} from './games-logic';

const ME = 'me';
const AMAKA = 'amaka';

const card = (over: Partial<GameCardPayload> = {}): GameCardPayload => ({
  matchId: 'm1',
  gameSlug: '_example',
  gameName: 'Pig',
  mode: 'free',
  stakeKobo: 0,
  potKobo: 0,
  counterStakeKobo: null,
  allowCounter: true,
  status: 'active',
  currentTurn: ME,
  winnerIds: null,
  draw: false,
  stateVersion: 0,
  ...over,
});

const match = (over: Partial<MatchView> = {}): MatchView => ({
  id: 'm1',
  gameSlug: '_example',
  gameName: 'Pig',
  mode: 'free',
  stakeKobo: 0,
  potKobo: 0,
  counterStakeKobo: null,
  allowCounter: false,
  status: 'active',
  conversationId: 'c1',
  createdBy: ME,
  players: [
    {
      userId: ME,
      username: 'me',
      displayName: 'Me',
      avatar: null,
      seat: 1,
      accepted: true,
      result: null,
      placement: null,
      stakedKobo: 0,
      payoutKobo: null,
    },
    {
      userId: AMAKA,
      username: 'amaka',
      displayName: 'Amaka',
      avatar: null,
      seat: 2,
      accepted: true,
      result: null,
      placement: null,
      stakedKobo: 0,
      payoutKobo: null,
    },
  ],
  stateVersion: 0,
  currentTurn: ME,
  view: null,
  outcome: null,
  inviteExpiresAt: null,
  createdAt: '2026-11-14T10:00:00.000Z',
  finishedAt: null,
  ...over,
});

describe('cardState', () => {
  it('tells the sender to wait and the invitee to answer', () => {
    const invited = card({ status: 'invited', currentTurn: null });
    expect(cardState(invited, ME, ME, 'Amaka')).toMatchObject({
      text: 'Waiting for Amaka',
      invite: 'wait',
      cta: null,
    });
    expect(cardState(invited, AMAKA, ME, 'Amaka')).toMatchObject({
      text: 'Amaka wants to play',
      invite: 'answer',
      cta: null,
    });
  });

  it('shows whose turn it is', () => {
    expect(cardState(card(), ME, ME, 'Amaka')).toMatchObject({
      text: 'Your turn',
      yourTurn: true,
      cta: 'play',
    });
    expect(cardState(card({ currentTurn: AMAKA }), ME, ME, 'Amaka')).toMatchObject({
      text: 'Waiting for Amaka',
      yourTurn: false,
      cta: 'watch',
    });
  });

  it('says who won, or that it was a draw', () => {
    const won = card({ status: 'finished', currentTurn: null, winnerIds: [ME] });
    expect(cardState(won, ME, ME, 'Amaka')).toMatchObject({ text: 'You won', cta: 'results' });
    expect(cardState(won, ME, AMAKA, 'Amaka').text).toBe('Amaka won');
    const draw = card({ status: 'finished', currentTurn: null, winnerIds: [], draw: true });
    expect(cardState(draw, ME, ME, 'Amaka').text).toBe("It's a draw");
  });

  it('closes out cancelled and expired invites', () => {
    expect(cardState(card({ status: 'cancelled' }), ME, ME, 'A')).toMatchObject({
      text: 'Invite cancelled',
      cta: null,
    });
    expect(cardState(card({ status: 'expired' }), ME, ME, 'A')).toMatchObject({
      text: 'Invite expired',
      cta: null,
    });
  });

  it('gives a screen reader the whole story', () => {
    const s = cardState(card(), ME, ME, 'Amaka');
    expect(cardLabel(card(), s)).toBe('Pig, free game. Your turn');
  });
});

describe('merging updates', () => {
  it('keeps the newer copy of a match', () => {
    const v2 = match({ stateVersion: 2 });
    expect(newerMatch(v2, match({ stateVersion: 1 }))).toBe(v2);
    const v3 = match({ stateVersion: 3 });
    expect(newerMatch(v2, v3)).toBe(v3);
    expect(newerMatch(undefined, v3)).toBe(v3);
  });

  it('lets the same version change status (invited to active)', () => {
    const invited = match({ status: 'invited', stateVersion: 0 });
    const active = match({ status: 'active', stateVersion: 0 });
    expect(newerMatch(invited, active)).toBe(active);
  });

  it('keeps the newer copy of a card', () => {
    const old = card({ stateVersion: 1 });
    const fresh = card({ stateVersion: 2 });
    expect(newerCard(fresh, old)).toBe(fresh);
    expect(newerCard(old, fresh)).toBe(fresh);
  });
});

describe('the drawer', () => {
  const game = (over: Partial<GameInfo> = {}): GameInfo => ({
    slug: '_example',
    name: 'Pig',
    dimension: '2d',
    sync: 'async',
    minPlayers: 2,
    maxPlayers: 2,
    categories: ['arcade'],
    supportsPool: false,
    poolMinKobo: null,
    ...over,
  });

  it('builds the chips from the games on offer', () => {
    const games = [game(), game({ slug: 'w', categories: ['word', 'board'] })];
    expect(categoryChips(games)).toEqual(['all', 'arcade', 'board', 'word']);
    expect(filterGames(games, 'all')).toHaveLength(2);
    expect(filterGames(games, 'word').map((g) => g.slug)).toEqual(['w']);
  });

  it('describes a game in one line', () => {
    expect(gameMeta(game())).toBe('2 players · 2D');
    expect(gameMeta(game({ maxPlayers: 4, dimension: '3d' }))).toBe('2-4 players · 3D');
  });
});

describe('Pig', () => {
  const view = (over: Partial<PigView> = {}): PigView => ({
    players: [ME, AMAKA],
    target: 50,
    scores: { [ME]: 12, [AMAKA]: 31 },
    turnPoints: 0,
    turn: 0,
    lastRoll: null,
    winner: null,
    ...over,
  });
  const name = (id: string) => (id === AMAKA ? 'Amaka' : 'Me');

  it('reads the server view and rejects nonsense', () => {
    expect(parsePigView(view())).toEqual(view());
    expect(parsePigView(null)).toBeNull();
    expect(parsePigView({ players: 'x' })).toBeNull();
  });

  it('says who rolled: a 1 passes the turn, so the roller is the previous player', () => {
    // I rolled a 4: it is still my turn
    expect(describeLastRoll(view({ lastRoll: 4, turnPoints: 4 }), ME, name)).toMatchObject({
      roller: ME,
      text: 'You rolled a 4.',
    });
    // Amaka rolled a 1, so it's now my turn
    expect(describeLastRoll(view({ lastRoll: 1, turn: 0 }), ME, name)).toMatchObject({
      roller: AMAKA,
      text: 'Amaka rolled a 1. Turn total lost.',
    });
    // I rolled a 1, so it's now Amaka's turn
    expect(describeLastRoll(view({ lastRoll: 1, turn: 1 }), ME, name)?.text).toBe(
      'You rolled a 1. Turn total lost.',
    );
    expect(describeLastRoll(view(), ME, name)).toBeNull();
    expect(describeLastRoll(view({ lastRoll: 3, winner: ME }), ME, name)).toBeNull();
  });

  it('writes the final score with you first', () => {
    expect(scoreLine(view({ scores: { [ME]: 52, [AMAKA]: 31 } }), ME, name)).toBe(
      'You 52 · Amaka 31',
    );
    expect(scoreLine(view({ scores: { [ME]: 20, [AMAKA]: 50 } }), AMAKA, name)).toBe(
      'You 50 · Me 20',
    );
  });
});

describe('results', () => {
  it('words a win, a loss and a draw', () => {
    const won = match({ status: 'finished', outcome: { winnerIds: [ME], draw: false } });
    expect(resultCopy(won, ME, 'Amaka', 'You 52 · Amaka 31')).toEqual({
      title: 'GG, you won',
      detail: 'You 52 · Amaka 31',
      tone: 'won',
    });
    expect(resultCopy(won, AMAKA, 'Me', null)).toMatchObject({ title: 'Me won', tone: 'lost' });
    const draw = match({ status: 'finished', outcome: { winnerIds: [], draw: true } });
    expect(resultCopy(draw, ME, 'Amaka', null)).toMatchObject({
      title: "It's a draw",
      tone: 'draw',
    });
  });

  it('finds the other player', () => {
    expect(opponentOf(match(), ME)?.userId).toBe(AMAKA);
    expect(opponentOf(match(), AMAKA)?.userId).toBe(ME);
  });
});

describe('canFetchMatch', () => {
  it('asks the server for a match only when there is an id', () => {
    expect(canFetchMatch('4f3c')).toBe(true);
    expect(canFetchMatch(undefined)).toBe(false);
    expect(canFetchMatch(null)).toBe(false);
    expect(canFetchMatch('')).toBe(false);
    expect(canFetchMatch('undefined')).toBe(false);
    expect(canFetchMatch('4f3c', false)).toBe(false);
  });
});
