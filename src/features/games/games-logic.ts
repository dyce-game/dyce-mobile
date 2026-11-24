import { formatNaira, type GameCardPayload, type GameInfo, type MatchView } from '@dyce/shared';

/**
 * Pure logic for game cards and matches: what a card says to each player, how a live update merges into
 * what is on screen, and how the Pig board reads the server's view. No React in here, so it is unit tested.
 */

// ---- the card in a chat ------------------------------------------------------------------------

export type CardState = {
  /** What the card says: "Your turn", "Waiting for Amaka", "You won". */
  text: string;
  /** Shows the YOUR TURN badge. */
  yourTurn: boolean;
  /**
   * An unanswered invite: the other person can answer, the sender can wait or take it back. In Pool the
   * invitee's counter-offer is the same again the other way round: the sender answers it, the invitee waits.
   */
  invite: 'answer' | 'wait' | 'counter-answer' | 'counter-wait' | null;
  /** The main button, if there is one. */
  cta: 'play' | 'watch' | 'results' | null;
};

/** What a game card says to `myId`. `senderId` is who sent the game; `peerName` is the other person. */
export function cardState(
  payload: GameCardPayload,
  senderId: string,
  myId: string | null,
  peerName: string,
): CardState {
  const mine = senderId === myId;
  const pool = payload.mode === 'pool';
  const stake = formatNaira(payload.stakeKobo ?? 0);
  const pot = formatNaira(payload.potKobo ?? 0);
  switch (payload.status) {
    case 'invited':
      return mine
        ? {
            text: pool ? `Waiting for ${peerName} · ${stake} locked` : `Waiting for ${peerName}`,
            yourTurn: false,
            invite: 'wait',
            cta: null,
          }
        : {
            text: pool
              ? `${peerName} locked ${stake}. Match it to play for ${pot}.`
              : `${peerName} wants to play`,
            yourTurn: false,
            invite: 'answer',
            cta: null,
          };
    case 'countered': {
      const c = payload.counterStakeKobo ?? 0;
      const offer = c === 0 ? 'to play this one free' : `${formatNaira(c)} each`;
      return mine
        ? {
            text: c === 0 ? `${peerName} asked to play free` : `${peerName} offered ${offer}`,
            yourTurn: false,
            invite: 'counter-answer',
            cta: null,
          }
        : {
            text: c === 0 ? 'You asked to play this one free' : `You offered ${offer}`,
            yourTurn: false,
            invite: 'counter-wait',
            cta: null,
          };
    }
    case 'active': {
      const yours = payload.currentTurn !== null && payload.currentTurn === myId;
      return yours
        ? { text: 'Your turn', yourTurn: true, invite: null, cta: 'play' }
        : { text: `Waiting for ${peerName}`, yourTurn: false, invite: null, cta: 'watch' };
    }
    case 'finished':
      return {
        text: payload.draw
          ? pool
            ? 'Pot split, stakes back'
            : "It's a draw"
          : payload.winnerIds?.includes(myId ?? '')
            ? pool
              ? `You won ${pot}`
              : 'You won'
            : pool
              ? `${peerName} took ${pot}`
              : `${peerName} won`,
        yourTurn: false,
        invite: null,
        cta: 'results',
      };
    case 'cancelled':
      return {
        text: pool ? 'Invite cancelled · stake returned' : 'Invite cancelled',
        yourTurn: false,
        invite: null,
        cta: null,
      };
    case 'expired':
      return {
        text: pool ? 'Invite expired · stake returned' : 'Invite expired',
        yourTurn: false,
        invite: null,
        cta: null,
      };
    default:
      return { text: 'In progress', yourTurn: false, invite: null, cta: 'watch' };
  }
}

/** The line a screen reader gets for a whole card. */
export function cardLabel(payload: GameCardPayload, state: CardState): string {
  return `${payload.gameName}, ${payload.mode} game. ${state.text}`;
}

// ---- keeping the cache in step -----------------------------------------------------------------

/**
 * Which copy of a match to keep: events and responses can arrive out of order, so an older version never
 * replaces a newer one (the same version can still change status, e.g. invited to active).
 */
export function newerMatch(cached: MatchView | undefined, incoming: MatchView): MatchView {
  if (!cached || cached.id !== incoming.id) return incoming;
  return incoming.stateVersion >= cached.stateVersion ? incoming : cached;
}

/** Same rule for the card in a thread. */
export function newerCard(cached: GameCardPayload, incoming: GameCardPayload): GameCardPayload {
  return incoming.stateVersion >= cached.stateVersion ? incoming : cached;
}

// ---- the drawer --------------------------------------------------------------------------------

/** "Arcade" from "arcade": category chips and tags are shown capitalised. */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** The filter chips: "All" plus each category present, in a stable order. */
export function categoryChips(games: GameInfo[]): string[] {
  return ['all', ...[...new Set(games.flatMap((g) => g.categories))].sort()];
}

export function filterGames(games: GameInfo[], chip: string): GameInfo[] {
  return chip === 'all' ? games : games.filter((g) => g.categories.includes(chip));
}

/** "2 players · 2D" */
export function gameMeta(game: GameInfo): string {
  const players =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}-${game.maxPlayers} players`;
  return `${players} · ${game.dimension.toUpperCase()}`;
}

// ---- Pig (the reference game) ------------------------------------------------------------------

/** What the server sends for Pig (the engine's view with the RNG state removed). */
export type PigView = {
  players: string[];
  target: number;
  scores: Record<string, number>;
  turnPoints: number;
  /** Index into `players` of whose turn it is. */
  turn: number;
  lastRoll: number | null;
  winner: string | null;
};

export function parsePigView(view: unknown): PigView | null {
  if (!view || typeof view !== 'object') return null;
  const v = view as Partial<PigView>;
  if (
    !Array.isArray(v.players) ||
    typeof v.target !== 'number' ||
    typeof v.scores !== 'object' ||
    v.scores === null ||
    typeof v.turnPoints !== 'number' ||
    typeof v.turn !== 'number'
  ) {
    return null;
  }
  return {
    players: v.players as string[],
    target: v.target,
    scores: v.scores as Record<string, number>,
    turnPoints: v.turnPoints,
    turn: v.turn,
    lastRoll: typeof v.lastRoll === 'number' ? v.lastRoll : null,
    winner: typeof v.winner === 'string' ? v.winner : null,
  };
}

/**
 * Who rolled the last die and what happened, for the line under the board. A 1 loses the turn total and
 * passes the turn, so the roller is the player before the current one; any other roll leaves the turn alone.
 */
export function describeLastRoll(
  view: PigView,
  myId: string | null,
  nameOf: (id: string) => string,
): { roller: string; roll: number; text: string } | null {
  if (view.lastRoll === null || view.winner !== null) return null;
  const count = view.players.length;
  const rollerIdx = view.lastRoll === 1 ? (view.turn - 1 + count) % count : view.turn;
  const roller = view.players[rollerIdx];
  if (!roller) return null;
  const who = roller === myId ? 'You' : nameOf(roller);
  const text =
    view.lastRoll === 1
      ? `${who} rolled a 1. Turn total lost.`
      : `${who} rolled a ${view.lastRoll}.`;
  return { roller, roll: view.lastRoll, text };
}

/** Final line on the results screen: "You 52 · Amaka 31". */
export function scoreLine(
  view: PigView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) =>
    a === myId ? -1 : b === myId ? 1 : (view.scores[b] ?? 0) - (view.scores[a] ?? 0),
  );
  return order
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${view.scores[id] ?? 0}`)
    .join(' · ');
}

// ---- results -----------------------------------------------------------------------------------

export type ResultCopy = { title: string; detail: string; tone: 'won' | 'lost' | 'draw' };

export function resultCopy(
  match: MatchView,
  myId: string | null,
  peerName: string,
  scores: string | null,
): ResultCopy {
  const outcome = match.outcome;
  const detail = scores ?? '';
  if (!outcome || outcome.draw) return { title: "It's a draw", detail, tone: 'draw' };
  return outcome.winnerIds.includes(myId ?? '')
    ? { title: 'GG, you won', detail, tone: 'won' }
    : { title: `${peerName} won`, detail, tone: 'lost' };
}

/** The other player in a match. */
export function opponentOf(match: MatchView, myId: string | null) {
  return match.players.find((p) => p.userId !== myId) ?? null;
}

// ---- Word Hunt ---------------------------------------------------------------------------------

export type WordHuntStatus = 'idle' | 'playing' | 'done';

/**
 * What the server sends for Word Hunt (the engine's view). The grid is null until you start; a player's
 * score is null until they are done; their words are null until you have finished too (or it is over).
 */
export type WordHuntView = {
  players: string[];
  roundMs: number;
  board: string[] | null;
  status: Record<string, WordHuntStatus>;
  scores: Record<string, number | null>;
  words: Record<string, string[] | null>;
  /** Your own count of dropped words, once you are done. */
  rejected: number | null;
  possibleWords: number | null;
  possibleScore: number | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseWordHuntView(view: unknown): WordHuntView | null {
  if (!isRecord(view)) return null;
  const { players, roundMs, board, status, scores, words } = view;
  if (!Array.isArray(players) || !players.every((p) => typeof p === 'string')) return null;
  if (typeof roundMs !== 'number' || !isRecord(status) || !isRecord(scores) || !isRecord(words)) {
    return null;
  }
  if (
    board !== null &&
    !(Array.isArray(board) && board.length === 16 && board.every((c) => typeof c === 'string'))
  ) {
    return null;
  }
  const outStatus: Record<string, WordHuntStatus> = {};
  const outScores: Record<string, number | null> = {};
  const outWords: Record<string, string[] | null> = {};
  for (const id of players as string[]) {
    const st = status[id];
    if (st !== 'idle' && st !== 'playing' && st !== 'done') return null;
    outStatus[id] = st;
    const sc = scores[id];
    outScores[id] = typeof sc === 'number' ? sc : null;
    const w = words[id];
    outWords[id] =
      Array.isArray(w) && w.every((x) => typeof x === 'string') ? (w as string[]) : null;
  }
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    players: players as string[],
    roundMs,
    board: board as string[] | null,
    status: outStatus,
    scores: outScores,
    words: outWords,
    rejected: num(view.rejected),
    possibleWords: num(view.possibleWords),
    possibleScore: num(view.possibleScore),
  };
}

/** Where you are in a Word Hunt round: not started, playing, finished and waiting, or the match is over. */
export type WordHuntStage = 'intro' | 'playing' | 'waiting' | 'over';

export function wordHuntStage(view: WordHuntView, myId: string | null): WordHuntStage {
  const mine = myId ? view.status[myId] : undefined;
  if (mine === 'playing') return 'playing';
  if (mine === 'done')
    return view.players.every((p) => view.status[p] === 'done') ? 'over' : 'waiting';
  return 'intro';
}

/**
 * Both players act at the same time, so the server's single `currentTurn` is only "the first one still
 * playing". For the card and the host, whose move it is = whether you have finished yet.
 */
export function wordHuntMover(view: WordHuntView, myId: string | null): string | null {
  if (myId && view.status[myId] !== 'done') return myId;
  return view.players.find((p) => p !== myId && view.status[p] !== 'done') ?? null;
}

/** "You 38 · Zainab 41", for the results line. */
export function wordHuntScoreLine(
  view: WordHuntView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return order
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${view.scores[id] ?? 0}`)
    .join(' · ');
}

/** A match is only fetched with an id: a link missing its parameter must not call `GET /matches/undefined` (BUG-3). */
export const canFetchMatch = (id: string | undefined | null, enabled = true): boolean =>
  enabled && typeof id === 'string' && id.length > 0 && id !== 'undefined';
