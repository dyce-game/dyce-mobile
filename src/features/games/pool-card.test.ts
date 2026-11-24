import type { GameCardPayload } from '@dyce/shared';
import { cardState } from './games-logic';

const ME = 'me';
const THEM = 'tunde';
const N = 100;

const card = (over: Partial<GameCardPayload> = {}): GameCardPayload => ({
  matchId: 'm1',
  gameSlug: '_example',
  gameName: 'Pig',
  mode: 'pool',
  stakeKobo: 1_000 * N,
  potKobo: 2_000 * N,
  counterStakeKobo: null,
  allowCounter: true,
  status: 'invited',
  currentTurn: null,
  winnerIds: null,
  draw: false,
  stateVersion: 0,
  ...over,
});

describe('cardState in Pool', () => {
  it('tells the sender their stake is locked and tells the invitee what matching means', () => {
    expect(cardState(card(), ME, ME, 'Tunde')).toMatchObject({
      text: 'Waiting for Tunde · Ð1,000 locked',
      invite: 'wait',
    });
    expect(cardState(card(), THEM, ME, 'Tunde')).toMatchObject({
      text: 'Tunde locked Ð1,000. Match it to play for Ð2,000.',
      invite: 'answer',
    });
  });

  it('turns a counter-offer around: the sender answers it, the invitee waits', () => {
    const countered = card({ status: 'countered', counterStakeKobo: 500 * N });
    expect(cardState(countered, ME, ME, 'Tunde')).toMatchObject({
      text: 'Tunde offered Ð500 each',
      invite: 'counter-answer',
    });
    expect(cardState(countered, THEM, ME, 'Tunde')).toMatchObject({
      text: 'You offered Ð500 each',
      invite: 'counter-wait',
    });
  });

  it('reads a counter to play free as that', () => {
    const free = card({ status: 'countered', counterStakeKobo: 0 });
    expect(cardState(free, ME, ME, 'Tunde').text).toBe('Tunde asked to play free');
    expect(cardState(free, THEM, ME, 'Tunde').text).toBe('You asked to play this one free');
  });

  it('shows the pot on the result and says the stake came back when it did not start', () => {
    const won = card({ status: 'finished', winnerIds: [ME] });
    expect(cardState(won, ME, ME, 'Tunde')).toMatchObject({
      text: 'You won Ð2,000',
      cta: 'results',
    });
    expect(cardState(won, ME, THEM, 'Tunde').text).toBe('Tunde took Ð2,000');
    expect(cardState(card({ status: 'finished', draw: true }), ME, ME, 'Tunde').text).toBe(
      'Pot split, stakes back',
    );
    expect(cardState(card({ status: 'cancelled' }), ME, ME, 'Tunde').text).toBe(
      'Invite cancelled · stake returned',
    );
    expect(cardState(card({ status: 'expired' }), ME, ME, 'Tunde').text).toBe(
      'Invite expired · stake returned',
    );
  });

  it('leaves Free cards as they were', () => {
    const free = card({ mode: 'free', stakeKobo: 0, potKobo: 0 });
    expect(cardState(free, ME, ME, 'Tunde').text).toBe('Waiting for Tunde');
    expect(cardState(free, THEM, ME, 'Tunde').text).toBe('Tunde wants to play');
  });
});
