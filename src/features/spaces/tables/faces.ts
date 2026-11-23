import type { CrazyCard, CrazyColor, WhotCard, WhotShape } from '@dyce/games';

/**
 * One card on the 3D card table, whichever game it is from: its identity (`key`), the words for it, and the
 * card as the server knows it (`raw`) so a move can be sent back unchanged. Pure, no React and no 3D.
 *
 * Crazy Cards is our own game: the colours are Red, Yellow, Green and Blue, each with its own mark (heart,
 * sun, leaf, drop) so colour is never the only signal; the Wild is the "Crazy card". Whot! keeps its names.
 */

export type TableGame = 'whot' | 'crazy-cards';

export type Special =
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'draw_four'
  | 'hold_on'
  | 'pick_two'
  | 'pick_three'
  | 'suspension'
  | 'general_market'
  | 'whot'
  | null;

export type Face =
  | {
      game: 'whot';
      key: string;
      suit: WhotShape | 'whot';
      rank: string;
      label: string;
      special: Special;
      raw: WhotCard;
    }
  | {
      game: 'crazy-cards';
      key: string;
      suit: CrazyColor | 'wild';
      rank: string;
      label: string;
      special: Special;
      raw: CrazyCard;
    };

export const SHAPE_PLURAL: Record<WhotShape, string> = {
  circle: 'circles',
  triangle: 'triangles',
  cross: 'crosses',
  square: 'squares',
  star: 'stars',
};

export const COLOR_NAME: Record<CrazyColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
};

/** The mark each Crazy Cards colour carries next to its colour. */
export const COLOR_MARK: Record<CrazyColor, string> = {
  red: 'heart',
  yellow: 'sun',
  green: 'leaf',
  blue: 'drop',
};

const CRAZY_VALUE_WORD: Record<string, string> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw_two: 'Draw Two',
};

export function crazyLabel(c: CrazyCard): string {
  if (c.color === 'wild') return c.value === 'draw_four' ? 'Crazy card, draw four' : 'Crazy card';
  return `${COLOR_NAME[c.color]} ${CRAZY_VALUE_WORD[c.value] ?? c.value}`;
}

export function whotLabel(c: WhotCard): string {
  return c.shape === 'whot' ? 'Whot card' : `${c.n} of ${SHAPE_PLURAL[c.shape]}`;
}

const WHOT_SPECIAL: Record<number, Special> = {
  1: 'hold_on',
  2: 'pick_two',
  5: 'pick_three',
  8: 'suspension',
  14: 'general_market',
  20: 'whot',
};

export function whotFace(c: WhotCard): Face {
  return {
    game: 'whot',
    key: `w:${c.shape}:${c.n}`,
    suit: c.shape,
    rank: String(c.n),
    label: whotLabel(c),
    special: c.shape === 'whot' ? 'whot' : (WHOT_SPECIAL[c.n] ?? null),
    raw: c,
  };
}

export function crazyFace(c: CrazyCard): Face {
  const special: Special =
    c.value === 'skip' ||
    c.value === 'reverse' ||
    c.value === 'draw_two' ||
    c.value === 'wild' ||
    c.value === 'draw_four'
      ? c.value
      : null;
  return {
    game: 'crazy-cards',
    key: `c:${c.color}:${c.value}`,
    suit: c.color,
    rank: c.value,
    label: crazyLabel(c),
    special,
    raw: c,
  };
}

const SUIT_ORDER = [
  'red',
  'yellow',
  'green',
  'blue',
  'circle',
  'triangle',
  'cross',
  'square',
  'star',
];
const CRAZY_RANK_ORDER = [
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
];

/** A hand in a steady, readable order: by colour or shape, then by number; wilds and Whot cards last. */
export function sortFaces(faces: readonly Face[]): Face[] {
  const rank = (f: Face): number =>
    f.game === 'whot' ? Number(f.rank) : CRAZY_RANK_ORDER.indexOf(f.rank);
  const suit = (f: Face): number =>
    f.suit === 'wild' || f.suit === 'whot' ? 99 : SUIT_ORDER.indexOf(f.suit);
  return [...faces].sort((a, b) => suit(a) - suit(b) || rank(a) - rank(b));
}
