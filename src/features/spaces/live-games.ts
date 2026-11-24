import { LIVE_GAMES, type LiveOptions, type LivePayoutScheme } from '@dyce/games';
import type { SpaceOptions } from '@dyce/shared';

/**
 * The live games a host can open a space for (Create a space). Seat limits and payout schemes come from the
 * same registry the server uses (`LIVE_GAMES`), so the screen can never offer what the API will refuse; the
 * names, one-line rules and option choices are copy and live here.
 */
export type OptionChoice = { value: string | number; label: string };
export type OptionSpec = {
  key: string;
  label: string;
  choices: OptionChoice[];
  /** What the game does when the host does not choose (shown as the selected choice). */
  default: string | number;
};

export type CreateGame = {
  slug: string;
  name: string;
  /** Letter on the game's tile until the real art lands. */
  mark: string;
  tile: string;
  blurb: string;
  minSeats: number;
  maxSeats: number;
  defaultSeats: number;
  schemes: readonly LivePayoutScheme[];
  /** Side games pay the winning side equally: the pot is shared, not ranked. */
  sidesWin: boolean;
  options: OptionSpec[];
};

type Copy = {
  name: string;
  mark: string;
  tile: string;
  blurb: string;
  defaultSeats: number;
  sidesWin?: boolean;
  options?: OptionSpec[];
};

const COPY: Record<string, Copy> = {
  whot: {
    name: 'Whot!',
    mark: 'W',
    tile: '#8C2A43',
    blurb: 'Nigerian card game',
    defaultSeats: 4,
  },
  'crazy-cards': {
    name: 'Crazy Cards',
    mark: 'C',
    tile: '#1F6F8B',
    blurb: 'Match the colour or number',
    defaultSeats: 4,
  },
  'ludo-room': {
    name: 'Ludo',
    mark: 'L',
    tile: '#2E8F64',
    blurb: 'Race your tokens home',
    defaultSeats: 4,
  },
  imposter: {
    name: 'Imposter',
    mark: 'I',
    tile: '#5B3FA0',
    blurb: 'Find who does not know the word',
    defaultSeats: 6,
    sidesWin: true,
    options: [
      {
        key: 'clueRounds',
        label: 'Clue rounds',
        default: 2,
        choices: [
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
        ],
      },
    ],
  },
  werewolf: {
    name: 'Werewolf',
    mark: 'V',
    tile: '#2F4B3A',
    blurb: 'Night and day, find the wolves',
    defaultSeats: 8,
    sidesWin: true,
  },
  charades: {
    name: 'Charades',
    mark: 'H',
    tile: '#B8741A',
    blurb: 'Act it out, teams score',
    defaultSeats: 6,
    options: [
      {
        key: 'mode',
        label: 'How to play',
        default: 'act',
        choices: [
          { value: 'act', label: 'Act it out' },
          { value: 'headsup', label: 'Phone on forehead' },
        ],
      },
    ],
  },
  'doodle-guess': {
    name: 'Doodle Guess',
    mark: 'D',
    tile: '#C93E1C',
    blurb: 'Draw it, they guess',
    defaultSeats: 5,
    options: [
      {
        key: 'rounds',
        label: 'Rounds',
        default: 3,
        choices: [
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
        ],
      },
    ],
  },
};

/** In the order the picker shows them. */
const ORDER = [
  'whot',
  'crazy-cards',
  'ludo-room',
  'imposter',
  'werewolf',
  'charades',
  'doodle-guess',
];

export const CREATE_GAMES: CreateGame[] = ORDER.flatMap((slug) => {
  const live = LIVE_GAMES[slug];
  const copy = COPY[slug];
  if (!live || !copy) return [];
  return [
    {
      slug,
      name: copy.name,
      mark: copy.mark,
      tile: copy.tile,
      blurb: copy.blurb,
      minSeats: live.minPlayers,
      maxSeats: live.maxPlayers,
      defaultSeats: Math.max(live.minPlayers, Math.min(live.maxPlayers, copy.defaultSeats)),
      schemes: live.payoutSchemes,
      sidesWin: copy.sidesWin ?? false,
      options: copy.options ?? [],
    },
  ];
});

export const createGame = (slug: string): CreateGame => CREATE_GAMES.find((g) => g.slug === slug)!;

/** "2–4 players · Nigerian card game" */
export const gameLine = (g: CreateGame): string =>
  `${g.minSeats}–${g.maxSeats} players · ${g.blurb}`;

/**
 * The options to send: only what the host changed from the default, and only what the game offers, in the
 * shape the API validates (`LIVE_GAMES[slug].optionsValid`). Null when there is nothing to send.
 */
export function buildOptions(
  game: CreateGame,
  chosen: Record<string, string | number>,
): SpaceOptions | undefined {
  const out: SpaceOptions = {};
  for (const spec of game.options) {
    const v = chosen[spec.key];
    if (v !== undefined && v !== spec.default) out[spec.key] = v;
  }
  if (Object.keys(out).length === 0) return undefined;
  const live = LIVE_GAMES[game.slug];
  return live && live.optionsValid(out as LiveOptions) ? out : undefined;
}
