import {
  crazyCardsEngine,
  imposterEngine,
  werewolfEngine,
  type CrazyCardsState,
} from '@dyce/games';
import type { LiveChat, LiveState } from '@dyce/shared';
import {
  debugActions,
  hasOwnTable,
  mergeChat,
  phaseOf,
  refusalText,
  roomKindOf,
  secondsLeft,
} from './party-logic';

const state = (over: Partial<LiveState> = {}): LiveState => ({
  matchId: 'm',
  spaceId: 's',
  gameSlug: 'imposter',
  mode: 'free',
  version: 3,
  status: 'live',
  view: {},
  seats: [],
  turnUserId: null,
  turnDeadlineAt: 1_030_000,
  roomKind: 'party',
  canAct: true,
  waiting: false,
  serverNow: 1_000_000,
  results: null,
  ...over,
});

describe('room kinds', () => {
  it('knows which games are turn rooms and which are party rooms', () => {
    expect(roomKindOf('whot')).toBe('turns');
    expect(roomKindOf('crazy-cards')).toBe('turns');
    for (const s of ['imposter', 'werewolf', 'charades', 'doodle-guess'])
      expect(roomKindOf(s)).toBe('party');
    expect(roomKindOf('chess')).toBeNull();
  });
  it('only Whot! has its own table so far', () => {
    expect(hasOwnTable('whot')).toBe(true);
    expect(hasOwnTable('imposter')).toBe(false);
  });
});

describe('secondsLeft', () => {
  it('counts down from the server clock, whatever the device clock says', () => {
    const s = state();
    expect(secondsLeft(s, 50_000, 50_000)).toBe(30);
    expect(secondsLeft(s, 50_000, 61_200)).toBe(19); // 11.2 s later
    expect(secondsLeft(s, 50_000, 500_000)).toBe(0); // never negative
  });
  it('has no clock when waiting, finished or without a deadline', () => {
    expect(secondsLeft(state({ turnDeadlineAt: null }), 0, 0)).toBeNull();
    expect(secondsLeft(state({ status: 'finished' }), 0, 0)).toBeNull();
  });
});

describe('mergeChat', () => {
  const line = (id: number): LiveChat => ({ id, userId: 'u', text: `t${id}`, at: id });
  it('adds new lines in order and ignores repeats (history arrives on every join)', () => {
    const a = mergeChat([], [line(2), line(1)]);
    expect(a.map((c) => c.id)).toEqual([1, 2]);
    const b = mergeChat(a, [line(2), line(3)]);
    expect(b.map((c) => c.id)).toEqual([1, 2, 3]);
  });
  it('keeps only the latest lines', () => {
    const many = Array.from({ length: 100 }, (_, i) => line(i + 1));
    const merged = mergeChat([], many, 80);
    expect(merged).toHaveLength(80);
    expect(merged[0]!.id).toBe(21);
  });
});

describe('debug actions', () => {
  it('imposter: ready, then clue on your turn, then a vote with the right number of names', () => {
    const s = imposterEngine.init(['a', 'b', 'c', 'd'], 1n, {});
    expect(debugActions('imposter', imposterEngine.view(s, 'a'), 'a')).toEqual([
      { label: 'Ready', action: { kind: 'ready' } },
    ]);
    const clue = { ...s, phase: 'clue' as const };
    const speaker = s.order[0]!;
    expect(debugActions('imposter', imposterEngine.view(clue, speaker), speaker)).toHaveLength(1);
    const other = s.players.find((p) => p !== speaker)!;
    expect(debugActions('imposter', imposterEngine.view(clue, other), other)).toEqual([]);
    const vote = debugActions('imposter', imposterEngine.view({ ...s, phase: 'vote' }, 'a'), 'a');
    expect(vote[0]!.action).toMatchObject({ kind: 'vote', targets: expect.any(Array) });
  });

  it('werewolf: night actions follow your role; nothing for a villager', () => {
    const s = werewolfEngine.init(['a', 'b', 'c', 'd', 'e'], 4n, {});
    const wolf = s.players.find((p) => s.roles[p] === 'werewolf')!;
    const villager = s.players.find((p) => s.roles[p] === 'villager')!;
    const w = debugActions('werewolf', werewolfEngine.view(s, wolf), wolf);
    expect(w[0]!.action).toMatchObject({ kind: 'kill' });
    expect(debugActions('werewolf', werewolfEngine.view(s, villager), villager)).toEqual([]);
  });

  it('crazy cards: plays the first playable card, calls the last card, otherwise draws', () => {
    const s: CrazyCardsState = crazyCardsEngine.init(['a', 'b'], 2n, {});
    const me = s.players[s.turn]!;
    const acts = debugActions('crazy-cards', crazyCardsEngine.view(s, me), me);
    expect(acts.at(-1)).toMatchObject({ label: expect.stringMatching(/Draw|Pass/) });
    const waiting = s.players.find((p) => p !== me)!;
    expect(debugActions('crazy-cards', crazyCardsEngine.view(s, waiting), waiting)).toEqual([]);
  });

  it('knows nothing about other games and bad views', () => {
    expect(debugActions('chess', {}, 'a')).toEqual([]);
    expect(debugActions('imposter', null, 'a')).toEqual([]);
    expect(phaseOf({ phase: 'vote' })).toBe('vote');
    expect(phaseOf(null)).toBeNull();
  });
});

describe('refusalText', () => {
  it('says what went wrong in words', () => {
    expect(refusalText(null)).toBeNull();
    expect(refusalText('not_your_turn')).toMatch(/can't act/);
    expect(refusalText('illegal_move:wrong_phase')).toMatch(/wrong_phase/);
    expect(refusalText('something_new')).toMatch(/something_new/);
  });
});
