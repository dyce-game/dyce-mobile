import { z } from 'zod';
import type { CrazyCard, CrazyColor, WhotCard, WhotEvent, WhotShape } from '@dyce/games';

/**
 * What the card room sends to ONE seat (`engine.view(state, you)`): the parsers for the two card games.
 * The wire is `unknown` until it passes through one of these; a view that does not parse is "the table
 * could not be read", never a crash. Only what is in the view is ever drawn: your own cards, the others'
 * counts, the card in play, and (once the game is over) every hand. No React and no 3D in this file.
 */

const id = z.string();
const cardColor = z.enum(['red', 'yellow', 'green', 'blue', 'wild']);
const crazyValue = z.enum([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'skip',
  'reverse',
  'draw_two',
  'wild',
  'draw_four',
]);
const crazyCard = z.object({ color: cardColor, value: crazyValue });
const colorOnly = z.enum(['red', 'yellow', 'green', 'blue']);

const crazyEvent = z.object({
  seq: z.number(),
  by: id,
  kind: z.enum(['play', 'draw', 'pass']),
  card: crazyCard.nullable(),
  drew: z.number(),
  effect: z.enum(['skip', 'reverse', 'draw_two', 'wild', 'draw_four']).nullable(),
  color: colorOnly,
  victim: id.nullable(),
  victimDrew: z.number(),
  missedCall: z.boolean(),
});

const crazyView = z.object({
  players: z.array(id).min(2),
  current: id.nullable(),
  dir: z.union([z.literal(1), z.literal(-1)]),
  hand: z.array(crazyCard),
  counts: z.record(z.string(), z.number()),
  deckCount: z.number(),
  top: crazyCard,
  color: colorOnly,
  drawn: crazyCard.nullable().default(null),
  winner: id.nullable(),
  endReason: z.enum(['out', 'blocked']).nullable(),
  last: crazyEvent.nullable(),
  hands: z.record(z.string(), z.array(crazyCard)).optional(),
  points: z.record(z.string(), z.number()).optional(),
});

export type CrazyEventView = z.infer<typeof crazyEvent>;
export type CrazyCardsView = Omit<
  z.infer<typeof crazyView>,
  'hand' | 'top' | 'drawn' | 'last' | 'hands'
> & {
  hand: CrazyCard[];
  top: CrazyCard;
  drawn: CrazyCard | null;
  last: CrazyEventView | null;
  hands?: Record<string, CrazyCard[]>;
};

export function parseCrazyView(raw: unknown): CrazyCardsView | null {
  const r = crazyView.safeParse(raw);
  return r.success ? (r.data as CrazyCardsView) : null;
}

// ---- Whot! ------------------------------------------------------------------------------------------

const shape = z.enum(['circle', 'triangle', 'cross', 'square', 'star']);
const whotCard = z.object({
  shape: z.enum(['circle', 'triangle', 'cross', 'square', 'star', 'whot']),
  n: z.number().int(),
});
const whotEvent = z.object({
  seq: z.number(),
  by: id,
  kind: z.enum(['play', 'draw']),
  card: whotCard.nullable(),
  drew: z.number(),
  effect: z
    .enum(['hold_on', 'pick_two', 'pick_three', 'suspension', 'general_market', 'whot'])
    .nullable(),
  requested: shape.nullable(),
  marketed: z.array(id),
  missedCall: z.enum(['last_card', 'check_up']).nullable(),
});

const whotView = z.object({
  players: z.array(id).min(2),
  current: id.nullable(),
  hand: z.array(whotCard),
  counts: z.record(z.string(), z.number()),
  marketCount: z.number(),
  top: whotCard,
  requested: shape.nullable(),
  pending: z.object({ n: z.number(), total: z.number() }).nullable(),
  winner: id.nullable(),
  endReason: z.enum(['out', 'blocked']).nullable(),
  last: whotEvent.nullable(),
  hands: z.record(z.string(), z.array(whotCard)).optional(),
  points: z.record(z.string(), z.number()).optional(),
});

export type WhotTableView = {
  players: string[];
  current: string | null;
  hand: WhotCard[];
  counts: Record<string, number>;
  marketCount: number;
  top: WhotCard;
  requested: WhotShape | null;
  pending: { n: number; total: number } | null;
  winner: string | null;
  endReason: 'out' | 'blocked' | null;
  last: WhotEvent | null;
  hands?: Record<string, WhotCard[]>;
  points?: Record<string, number>;
};

export function parseWhotTableView(raw: unknown): WhotTableView | null {
  const r = whotView.safeParse(raw);
  return r.success ? (r.data as WhotTableView) : null;
}

export type { CrazyColor };
