import { crazyCanPlay, whotCanPlay, type CrazyColor, type WhotShape } from '@dyce/games';
import type { LiveResultRow, LiveState } from '@dyce/shared';
import { lastEventLine, marketLabel, ruleLine as whotRuleLine, type WhotView } from '../whot-logic';
import {
  COLOR_NAME,
  SHAPE_PLURAL,
  crazyFace,
  sortFaces,
  whotFace,
  type Face,
  type Special,
  type TableGame,
} from './faces';
import { parseCrazyView, parseWhotTableView, type CrazyCardsView } from './views';

/**
 * The card table as the 3D scene and the controls both read it: one shape for Whot! and Crazy Cards, built
 * from the seat's own `view()` and the live state. It holds only what the view allows (your cards, the
 * others' counts, the card in play, every hand once the game is over). No React, no 3D, so it is tested.
 */

export const CARD_GAMES: readonly string[] = ['whot', 'crazy-cards'];
export const isCardGame = (slug: string): slug is TableGame => CARD_GAMES.includes(slug);

export type TableSeat = {
  id: string;
  /** 0 is you; the rest follow in the order of play, so the table reads clockwise from your left. */
  index: number;
  name: string;
  count: number;
  current: boolean;
  forfeited: boolean;
  connected: boolean;
  /** Down to one card. */
  lastCard: boolean;
  /** Hand value left over, shown once the game is over. */
  points: number | null;
  /** Every seat's cards, shown once the game is over. */
  revealed: Face[] | null;
};

export type TableEvent = {
  seq: number;
  by: string;
  kind: 'play' | 'draw' | 'pass';
  card: Face | null;
  drew: number;
  effect: Special;
  victim: string | null;
  victimDrew: number;
  marketed: string[];
  missedCall: boolean;
  requested: WhotShape | null;
  color: CrazyColor | null;
};

export type HandCard = { face: Face; playable: boolean };

export type TableModel = {
  game: TableGame;
  /** The room's version of the table (bumps with every accepted move). */
  version: number;
  over: boolean;
  seats: TableSeat[];
  hand: HandCard[];
  top: Face;
  deckCount: number;
  /** Crazy Cards: the colour in force. */
  colorInForce: CrazyColor | null;
  /** Whot!: the shape a Whot card asked for. */
  askedShape: WhotShape | null;
  /** Whot!: the pick-two / pick-three you face. */
  pending: { n: number; total: number } | null;
  /** 1 clockwise, -1 the other way. */
  direction: 1 | -1;
  myTurn: boolean;
  canDraw: boolean;
  /** Crazy Cards: you drew a playable card and may play it or pass. */
  canPass: boolean;
  drawLabel: string;
  drawn: Face | null;
  event: TableEvent | null;
  winnerId: string | null;
  endReason: 'out' | 'blocked' | null;
  ruleLine: string;
  results: LiveResultRow[] | null;
};

export type ModelInput = Pick<
  LiveState,
  'view' | 'version' | 'status' | 'turnUserId' | 'seats' | 'results'
>;

type Names = (id: string) => string;

/** Seats in table order starting with `me` (the order of play after you). */
export function seatOrder(players: readonly string[], me: string): string[] {
  const i = players.indexOf(me);
  if (i < 0) return [...players];
  return [...players.slice(i), ...players.slice(0, i)];
}

type Common = {
  players: string[];
  counts: Record<string, number>;
  points?: Record<string, number>;
  revealedFaces: Record<string, Face[]> | null;
};

function buildSeats(
  c: Common,
  live: ModelInput,
  me: string,
  nameOf: Names,
  over: boolean,
): TableSeat[] {
  return seatOrder(c.players, me).map((id, index) => {
    const seat = live.seats.find((s) => s.userId === id);
    const count = c.counts[id] ?? 0;
    return {
      id,
      index,
      name: nameOf(id),
      count,
      current: !over && live.turnUserId === id,
      forfeited: seat?.forfeited ?? false,
      connected: seat?.connected ?? true,
      lastCard: !over && count === 1,
      points: over ? (c.points?.[id] ?? null) : null,
      revealed: over ? (c.revealedFaces?.[id] ?? null) : null,
    };
  });
}

/** The table for a seat, or null when the room's view is not this game's. */
export function buildTableModel(
  slug: string,
  live: ModelInput,
  me: string,
  nameOf: Names,
): TableModel | null {
  if (slug === 'whot') return buildWhot(live, me, nameOf);
  if (slug === 'crazy-cards') return buildCrazy(live, me, nameOf);
  return null;
}

function buildWhot(live: ModelInput, me: string, nameOf: Names): TableModel | null {
  const v = parseWhotTableView(live.view);
  if (!v) return null;
  const over = v.endReason !== null || live.status === 'finished';
  const mySeat = live.seats.find((s) => s.userId === me);
  const myTurn = live.status === 'live' && live.turnUserId === me && !mySeat?.forfeited && !over;
  const hand = sortFaces(v.hand.map(whotFace)).map((face) => ({
    face,
    playable: myTurn && whotCanPlay(face.raw as never, v.top, v.requested, v.pending),
  }));
  const event: TableEvent | null = v.last
    ? {
        seq: v.last.seq,
        by: v.last.by,
        kind: v.last.kind,
        card: v.last.card ? whotFace(v.last.card) : null,
        drew: v.last.drew,
        effect: v.last.effect,
        victim: null,
        victimDrew: 0,
        marketed: v.last.marketed,
        missedCall: v.last.missedCall !== null,
        requested: v.last.requested,
        color: null,
      }
    : null;
  const wv = v as WhotView;
  return {
    game: 'whot',
    version: live.version,
    over,
    seats: buildSeats(
      {
        players: v.players,
        counts: v.counts,
        points: v.points,
        revealedFaces: reveal(v.hands, whotFace),
      },
      live,
      me,
      nameOf,
      over,
    ),
    hand,
    top: whotFace(v.top),
    deckCount: v.marketCount,
    colorInForce: null,
    askedShape: v.requested,
    pending: v.pending,
    direction: 1,
    myTurn,
    canDraw: myTurn,
    canPass: false,
    drawLabel: marketLabel(wv),
    drawn: null,
    event,
    winnerId: v.winner,
    endReason: v.endReason,
    ruleLine: whotRuleLine(wv),
    results: live.results,
  };
}

function reveal<C>(
  hands: Record<string, C[]> | undefined,
  face: (c: C) => Face,
): Record<string, Face[]> | null {
  if (!hands) return null;
  return Object.fromEntries(Object.entries(hands).map(([id, cs]) => [id, sortFaces(cs.map(face))]));
}

const VALUE_WORD: Record<string, string> = {
  skip: 'a Skip',
  reverse: 'a Reverse',
  draw_two: 'a Draw Two',
  draw_four: 'a Draw Four',
};

function crazyRule(v: CrazyCardsView, topLabel: string): string {
  if (v.endReason) return v.endReason === 'out' ? 'The game is over' : 'Nobody can move';
  if (v.drawn) return 'You drew a card you can play. Play it or pass';
  const colour = COLOR_NAME[v.color].toLowerCase();
  if (v.top.color === 'wild') return `Crazy card on top · play ${colour} or a Crazy card`;
  const valueWord = VALUE_WORD[v.top.value] ?? `a ${v.top.value}`;
  return `${topLabel} on top · play ${colour}, ${valueWord} or a Crazy card`;
}

function buildCrazy(live: ModelInput, me: string, nameOf: Names): TableModel | null {
  const v = parseCrazyView(live.view);
  if (!v) return null;
  const over = v.endReason !== null || live.status === 'finished';
  const mySeat = live.seats.find((s) => s.userId === me);
  const myTurn = live.status === 'live' && live.turnUserId === me && !mySeat?.forfeited && !over;
  const drawn = v.drawn ? crazyFace(v.drawn) : null;
  const hand = sortFaces(v.hand.map(crazyFace)).map((face) => ({
    face,
    playable:
      myTurn && (drawn ? face.key === drawn.key : crazyCanPlay(face.raw as never, v.top, v.color)),
  }));
  const e = v.last;
  const event: TableEvent | null = e
    ? {
        seq: e.seq,
        by: e.by,
        kind: e.kind,
        card: e.card ? crazyFace(e.card) : null,
        drew: e.drew,
        effect: e.effect,
        victim: e.victim,
        victimDrew: e.victimDrew,
        marketed: [],
        missedCall: e.missedCall,
        requested: null,
        color: e.color,
      }
    : null;
  const top = crazyFace(v.top);
  return {
    game: 'crazy-cards',
    version: live.version,
    over,
    seats: buildSeats(
      {
        players: v.players,
        counts: v.counts,
        points: v.points,
        revealedFaces: reveal(v.hands, crazyFace),
      },
      live,
      me,
      nameOf,
      over,
    ),
    hand,
    top,
    deckCount: v.deckCount,
    colorInForce: v.color,
    askedShape: null,
    pending: null,
    direction: v.dir,
    myTurn,
    canDraw: myTurn && !drawn,
    canPass: myTurn && drawn !== null,
    drawLabel: 'Draw a card',
    drawn,
    event,
    winnerId: v.winner,
    endReason: v.endReason,
    ruleLine: crazyRule(v, top.label),
    results: live.results,
  };
}

// ---- moves ------------------------------------------------------------------------------------------

/** What a card needs before it can be played: Whot cards ask for a shape, Crazy cards name a colour. */
export function choiceNeeded(face: Face): 'shape' | 'color' | null {
  if (face.game === 'whot') return face.suit === 'whot' ? 'shape' : null;
  return face.suit === 'wild' ? 'color' : null;
}

/** The shape you hold most of (Whot!) or the colour (Crazy Cards), to preselect when you play a wild. */
export function mostHeld(hand: readonly HandCard[], game: TableGame): string | null {
  const count = new Map<string, number>();
  for (const { face } of hand) {
    if (face.suit === 'wild' || face.suit === 'whot') continue;
    count.set(face.suit, (count.get(face.suit) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [s, c] of count) {
    if (c > n) {
      best = s;
      n = c;
    }
  }
  return best ?? (game === 'whot' ? 'circle' : 'red');
}

/**
 * The move for playing `face`. The server asks for `call: true` on the play that leaves one card ("Last
 * card!"), and Whot! also on the one that goes out: the app always sends it, so nobody is charged two
 * cards for forgetting. A wild needs the shape or colour you choose.
 */
export function playMove(m: TableModel, face: Face, choice?: string): unknown {
  const left = m.hand.length - 1;
  if (face.game === 'whot') {
    return {
      kind: 'play',
      card: face.raw,
      ...(face.suit === 'whot' ? { shape: choice ?? mostHeld(m.hand, 'whot') } : null),
      ...(left <= 1 ? { call: true } : null),
    };
  }
  return {
    kind: 'play',
    card: face.raw,
    ...(face.suit === 'wild' ? { color: choice ?? mostHeld(m.hand, 'crazy-cards') } : null),
    ...(left === 1 ? { call: true } : null),
  };
}

export const drawMove = (): unknown => ({ kind: 'draw' });
export const passMove = (): unknown => ({ kind: 'pass' });

/** Playing this card leaves one card: the call is made with it. */
export const callsLastCard = (m: TableModel): boolean => m.hand.length === 2;

// ---- words ------------------------------------------------------------------------------------------

const EFFECT_WORDS: Partial<Record<NonNullable<Special>, string>> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw_two: 'Draw Two',
  wild: 'a Crazy card',
  draw_four: 'a Crazy Draw Four',
};

/** One line for what just happened ("Amaka played Blue 7"), or null before the first move. */
export function eventLine(m: TableModel, nameOf: Names, raw?: unknown): string | null {
  const e = m.event;
  if (!e) return null;
  if (m.game === 'whot') {
    const v = parseWhotTableView(raw);
    return v ? lastEventLine(v.last, nameOf) : null;
  }
  const who = nameOf(e.by);
  if (e.kind === 'pass') return `${who} passed`;
  if (e.kind === 'draw') return e.drew === 0 ? `${who} couldn't draw` : `${who} drew a card`;
  const what =
    e.effect && EFFECT_WORDS[e.effect]
      ? e.card && e.card.suit !== 'wild'
        ? e.card.label
        : EFFECT_WORDS[e.effect]
      : (e.card?.label ?? 'a card');
  const bits = [`${who} played ${what}`];
  if (e.card?.suit === 'wild' && e.color) bits.push(`chose ${COLOR_NAME[e.color].toLowerCase()}`);
  if (e.missedCall) bits.push('forgot to call last card, +2');
  return bits.join(' · ');
}

/** "Asked for circles" / "Blue in play" for the table's centre. */
export function inForceLine(m: TableModel): string | null {
  if (m.askedShape) return `Asked for ${SHAPE_PLURAL[m.askedShape]}`;
  if (m.colorInForce) return `${COLOR_NAME[m.colorInForce]} in play`;
  return null;
}

/** The scoreboard words for a seat at the end: "Out of cards" / "12 points left". */
export function endLine(seat: TableSeat, m: TableModel): string {
  if (m.winnerId === seat.id) return m.endReason === 'out' ? 'Played out' : 'Fewest points';
  if (seat.points !== null) return `${seat.points} ${seat.points === 1 ? 'point' : 'points'} left`;
  return `${seat.count} ${seat.count === 1 ? 'card' : 'cards'} left`;
}
