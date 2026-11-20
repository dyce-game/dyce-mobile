import {
  WHOT_SHAPES,
  whotCanPlay,
  type WhotAction,
  type WhotCard,
  type WhotEvent,
  type WhotShape,
} from '@dyce/games';
import type { LiveState } from '@dyce/shared';

/**
 * Pure logic for the Whot table (design: PlayWhot, Card): how the app reads the server's view of the table,
 * which cards are playable, what move a tap means, and the words for what just happened. The server decides
 * every rule (it validates each move with the same engine); this only decides what to highlight and send.
 * No React in here, so it is unit tested.
 */

export type WhotView = {
  players: string[];
  current: string | null;
  /** Your own cards. */
  hand: WhotCard[];
  /** Cards in each player's hand. */
  counts: Record<string, number>;
  marketCount: number;
  top: WhotCard;
  requested: WhotShape | null;
  pending: { n: number; total: number } | null;
  winner: string | null;
  endReason: 'out' | 'blocked' | null;
  last: WhotEvent | null;
};

const isCard = (c: unknown): c is WhotCard =>
  !!c &&
  typeof c === 'object' &&
  typeof (c as WhotCard).shape === 'string' &&
  typeof (c as WhotCard).n === 'number';

/** The table as the server sent it, or null if it isn't a Whot view (so the screen never crashes on garbage). */
export function parseWhotView(raw: unknown): WhotView | null {
  const v = raw as Partial<WhotView> | null;
  if (!v || typeof v !== 'object') return null;
  if (!Array.isArray(v.players) || !Array.isArray(v.hand) || !v.hand.every(isCard)) return null;
  if (!isCard(v.top) || !v.counts || typeof v.counts !== 'object') return null;
  return {
    players: v.players as string[],
    current: v.current ?? null,
    hand: v.hand,
    counts: v.counts,
    marketCount: v.marketCount ?? 0,
    top: v.top,
    requested: v.requested ?? null,
    pending: v.pending ?? null,
    winner: v.winner ?? null,
    endReason: v.endReason ?? null,
    last: v.last ?? null,
  };
}

export const SHAPE_NAME: Record<WhotShape, string> = {
  circle: 'circle',
  triangle: 'triangle',
  cross: 'cross',
  square: 'square',
  star: 'star',
};

export const SHAPE_PLURAL: Record<WhotShape, string> = {
  circle: 'circles',
  triangle: 'triangles',
  cross: 'crosses',
  square: 'squares',
  star: 'stars',
};

export const SHAPES: readonly WhotShape[] = WHOT_SHAPES;

export const isWhotCard = (c: WhotCard): boolean => c.shape === 'whot';

const sameCard = (a: WhotCard, b: WhotCard): boolean => a.shape === b.shape && a.n === b.n;
export { sameCard };

export function cardLabel(c: WhotCard): string {
  return c.shape === 'whot' ? 'Whot card' : `${c.n} of ${SHAPE_PLURAL[c.shape]}`;
}

/** Cards you may play right now. Empty when it isn't your turn. */
export function playableCards(view: WhotView, myTurn: boolean): WhotCard[] {
  if (!myTurn) return [];
  return view.hand.filter((c) => whotCanPlay(c, view.top, view.requested, view.pending));
}

/** A hand in a steady, readable order: by shape, then number, the Whot cards last. */
export function sortedHand(hand: readonly WhotCard[]): WhotCard[] {
  const order = (c: WhotCard) => (c.shape === 'whot' ? 99 : WHOT_SHAPES.indexOf(c.shape));
  return [...hand].sort((a, b) => order(a) - order(b) || a.n - b.n);
}

/**
 * The move for playing `card`. The server requires `call: true` on the play that leaves one card ("last
 * card!") and on the one that goes out ("check up!"), so the app always sends it then: nobody loses cards
 * for forgetting. A Whot card needs the shape you ask for.
 */
export function playAction(view: WhotView, card: WhotCard, shape?: WhotShape): WhotAction {
  const left = view.hand.length - 1;
  return {
    kind: 'play',
    card,
    ...(card.shape === 'whot' ? { shape: shape ?? mostHeldShape(view.hand) ?? 'circle' } : null),
    ...(left <= 1 ? { call: true } : null),
  };
}

export const drawAction = (): WhotAction => ({ kind: 'draw' });

/** The shape you hold most of, to pre-select when you play a Whot. */
export function mostHeldShape(hand: readonly WhotCard[]): WhotShape | null {
  let best: WhotShape | null = null;
  let bestN = 0;
  for (const s of WHOT_SHAPES) {
    const n = hand.filter((c) => c.shape === s).length;
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

/** The text on the market button ("Go to market", "Pick 2"). */
export function marketLabel(view: WhotView): string {
  return view.pending ? `Pick ${view.pending.total}` : 'Go to market';
}

/** The pill above your hand: what the table is asking for. */
export function ruleLine(view: WhotView): string {
  if (view.endReason) return view.endReason === 'out' ? 'The game is over' : 'Nobody can move';
  if (view.pending) {
    const word = view.pending.n === 2 ? 'Pick two' : 'Pick three';
    return `${word}! Play a ${view.pending.n} or ${marketLabel(view).toLowerCase()}`;
  }
  if (view.requested) return `Whot! Play a ${SHAPE_NAME[view.requested]} or a Whot`;
  const top = view.top;
  return top.shape === 'whot'
    ? 'Play anything'
    : `${top.n} of ${SHAPE_PLURAL[top.shape]} on top · match the shape or the number`;
}

const EFFECT_WORDS: Record<NonNullable<WhotEvent['effect']>, string> = {
  hold_on: 'Hold on, plays again',
  pick_two: 'Pick two',
  pick_three: 'Pick three',
  suspension: 'Suspension',
  general_market: 'General market',
  whot: 'Whot',
};

/** One line for what just happened ("Amaka played Pick Two"), or null before the first move. */
export function lastEventLine(
  last: WhotEvent | null,
  nameOf: (userId: string) => string,
): string | null {
  if (!last) return null;
  const who = nameOf(last.by);
  if (last.kind === 'draw') {
    return last.drew === 0
      ? `${who} couldn't pick a card`
      : `${who} went to market${last.drew > 1 ? ` (${last.drew} cards)` : ''}`;
  }
  const bits: string[] = [];
  bits.push(
    last.effect === null || !last.card
      ? `${who} played ${last.card ? cardLabel(last.card) : 'a card'}`
      : `${who} played ${EFFECT_WORDS[last.effect]}`,
  );
  if (last.requested) bits.push(`asking for ${SHAPE_PLURAL[last.requested]}`);
  if (last.missedCall) {
    bits.push(
      last.missedCall === 'last_card' ? 'forgot to call last card, +2' : 'forgot to check up, +2',
    );
  }
  return bits.join(' · ');
}

/** "Last card!" for the seats down to one card. */
export const onLastCard = (view: WhotView): string[] =>
  view.players.filter((p) => (view.counts[p] ?? 0) === 1);

/** Whole seconds left on the turn clock, correcting for a device clock that is off from the server's. */
export function secondsLeft(
  state: Pick<LiveState, 'turnDeadlineAt' | 'serverNow'>,
  receivedAtLocal: number,
  nowLocal: number,
): number | null {
  if (state.turnDeadlineAt === null) return null;
  // How far ahead of the server this device's clock is, from the moment the state arrived.
  const skew = receivedAtLocal - state.serverNow;
  const deadlineLocal = state.turnDeadlineAt + skew;
  return Math.max(0, Math.ceil((deadlineLocal - nowLocal) / 1000));
}

/** Where opponents sit around the top of the table: 1 across the middle, 2 left and right, 3 spread. */
export function opponentSlots(n: number): { x: number; y: number }[] {
  if (n <= 1) return [{ x: 0.5, y: 0 }];
  if (n === 2) {
    return [
      { x: 0.2, y: 0.12 },
      { x: 0.8, y: 0.12 },
    ];
  }
  return [
    { x: 0.14, y: 0.2 },
    { x: 0.5, y: 0 },
    { x: 0.86, y: 0.2 },
  ];
}

/** Opponents in turn order starting after you, so the table reads clockwise from your left. */
export function opponentsOf(players: string[], me: string): string[] {
  const i = players.indexOf(me);
  if (i < 0) return players.filter((p) => p !== me);
  return [...players.slice(i + 1), ...players.slice(0, i)];
}
