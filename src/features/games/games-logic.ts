import type { GameCardPayload, GameInfo, MatchView } from '@dyce/shared';

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
  /** An unanswered invite: the other person can answer, the sender can wait or take it back. */
  invite: 'answer' | 'wait' | null;
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
  switch (payload.status) {
    case 'invited':
      return mine
        ? { text: `Waiting for ${peerName}`, yourTurn: false, invite: 'wait', cta: null }
        : { text: `${peerName} wants to play`, yourTurn: false, invite: 'answer', cta: null };
    case 'active':
    case 'countered': {
      const yours = payload.currentTurn !== null && payload.currentTurn === myId;
      return yours
        ? { text: 'Your turn', yourTurn: true, invite: null, cta: 'play' }
        : { text: `Waiting for ${peerName}`, yourTurn: false, invite: null, cta: 'watch' };
    }
    case 'finished':
      return {
        text: payload.draw
          ? "It's a draw"
          : payload.winnerIds?.includes(myId ?? '')
            ? 'You won'
            : `${peerName} won`,
        yourTurn: false,
        invite: null,
        cta: 'results',
      };
    case 'cancelled':
      return { text: 'Invite cancelled', yourTurn: false, invite: null, cta: null };
    case 'expired':
      return { text: 'Invite expired', yourTurn: false, invite: null, cta: null };
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
