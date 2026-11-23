import { formatNaira } from '@dyce/shared';

/**
 * The rules sheet for every game in docs/GAMES.md (the "how to play in 3 bullets" and the Pool rules line,
 * per-game deliverable 4), plus the Pool minimum stake from the same table. Pure data: no React, so it is
 * unit tested. The server holds the same minimums in `games.pool_min_stake_kobo` (backend migration 0020)
 * and is the one that enforces them; this copy only labels the sheet.
 *
 * Adding a game: its copy is already here. Change the words only if the rules changed.
 */

export type GameRules = {
  /** How to play, in three short bullets. */
  how: readonly [string, string, string];
  /** What Pool means in this game, one sentence (the minimum stake is added by `poolRulesLine`). */
  pool: string;
  /** Smallest Pool stake in kobo (docs/GAMES.md); null for the dev-only reference game. */
  poolMinKobo: number | null;
};

const DUEL =
  'You both stake the same amount and the winner takes the pot. A draw gives both stakes back.';
const ROOM =
  'Everyone puts in the same seat fee and the pot is paid out by finishing place, as the host chose.';
const SIDE = 'Everyone puts in the same seat fee and the winning side shares the pot equally.';

const NAIRA = 100;

/** Every catalogue slug, in the order of docs/GAMES.md, plus Pig (`_example`). */
export const GAME_SLUGS = [
  'cup-pong',
  'eight-ball',
  'darts',
  'basketball',
  'archery',
  'mini-golf',
  'tanks',
  'sea-battle',
  'chess',
  'checkers',
  'ayo',
  'ludo',
  'dots-and-boxes',
  'word-tiles',
  'word-hunt',
  'anagrams',
  'filler',
  'crazy-cards',
  'whot',
  'charades',
  'imposter',
  'werewolf',
  'doodle-guess',
  '_example',
] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export const GAME_RULES: Record<GameSlug, GameRules> = {
  'cup-pong': {
    how: [
      'Swipe to throw: the direction and the speed of your flick aim the ball at the other side’s ten cups.',
      'Three balls a turn. A sunk cup comes off the table. Once a game, at the start of your turn, you can re-rack your 2 to 6 remaining cups.',
      'Clear the other side’s cups first. After twelve rounds, the most cups sunk wins.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  'eight-ball': {
    how: [
      'Drag to set the angle and the power, and shift the cue tip to add spin.',
      'Pot your group (solids or stripes) first, then call a pocket and sink the 8 to win.',
      'A foul gives the other player the cue ball anywhere on the table.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  darts: {
    how: [
      'Move the aim point on the board and throw. Your hand wobbles a little, so aim for the big areas.',
      'Start at 501 and count down. You must finish on a double and you cannot go below zero.',
      'Three darts a turn. The first player to reach exactly zero wins. “Around the clock” is the free variant.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  basketball: {
    how: [
      'Flick up the screen to shoot: the angle sets the aim and the length of the flick sets the power.',
      'Five racks of five shots from five spots around the court.',
      'The last rack is the money rack and every basket counts double. Highest score wins.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  archery: {
    how: [
      'Drag to aim, then pull back to draw the bow and let go to loose the arrow.',
      'Three ends of three arrows. The wind changes every end, so allow for it.',
      'Closer to the gold scores more. The highest total after three ends wins.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  'mini-golf': {
    how: [
      'Drag back from the ball and let go to putt: the direction and the length of the drag set the shot.',
      'Nine holes, fewest strokes wins. Six strokes is the most any hole can cost you.',
      'Each player plays a whole hole in one go. You cannot see the others’ putts until you have finished the hole.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  tanks: {
    how: [
      'Set the angle and the power, pick a weapon and fire. The wind pushes the shell.',
      'Shots blow holes in the ground, and tanks drop into the holes. Heavy and triple shells are limited, the plain shell is not.',
      'Bring the other tank’s health to zero first. After twelve shots each, the healthier tank wins.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  'sea-battle': {
    how: [
      'Place your fleet on the 10 by 10 grid. The other player cannot see where your ships are.',
      'Take turns firing at a square. A hit lets you know, and a sunk ship is announced.',
      'Sink the whole enemy fleet before they sink yours.',
    ],
    pool: DUEL,
    poolMinKobo: 500 * NAIRA,
  },
  chess: {
    how: [
      'The usual rules: castling, en passant and promotion all work. White moves first.',
      'Checkmate wins. Stalemate, three repeats of a position, 50 moves without a capture or pawn move, or too few pieces left is a draw.',
      'There is no clock, so take your time. You can resign at any point.',
    ],
    pool: DUEL,
    poolMinKobo: 500 * NAIRA,
  },
  checkers: {
    how: [
      'Move a piece one square diagonally forward. Jump over an opponent’s piece to capture it.',
      'If you can capture, you must. A piece that reaches the far row becomes a king and moves both ways.',
      'Capture or block every enemy piece to win.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  ayo: {
    how: [
      'Pick a pit on your side and sow its seeds one by one, anticlockwise.',
      'If your last seed lands in an empty pit on your own side, you capture the seeds in the pit opposite. If it lands in a pit that already has seeds, you carry on sowing from there.',
      'The first to capture 25 seeds wins.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  ludo: {
    how: [
      'Roll the dice. You need a six to bring a token out of the yard.',
      'Move a token round the board by the number rolled. Land on another player’s token and it goes back to its yard, unless it is on a safe square.',
      'Get all four tokens home first. A six gives you another roll.',
    ],
    pool: DUEL,
    poolMinKobo: 500 * NAIRA,
  },
  'dots-and-boxes': {
    how: [
      'Take turns drawing a line between two neighbouring dots.',
      'Draw the fourth side of a box to claim it, and you go again.',
      'The most boxes at the end wins.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  'word-tiles': {
    how: [
      'Drag tiles from your rack onto the board to make words in one row or column, joined to the words already there.',
      'Premium squares multiply the score, and using all seven tiles earns a 30 point bonus.',
      'Only real words count: the server checks every word. Highest score when the tiles run out wins.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  'word-hunt': {
    how: [
      'Press Start. You get 80 seconds on a 4 by 4 grid of letters, and your friend plays the same grid.',
      'Swipe through touching letters (diagonals too) to spell words of three letters or more.',
      'Longer words score more. The highest score wins, and you can see each other’s words afterwards.',
    ],
    pool: DUEL,
    poolMinKobo: 200 * NAIRA,
  },
  anagrams: {
    how: [
      'Press Start. You get 60 seconds and six letters, and your friend gets the same six.',
      'Make as many words as you can from those letters, three letters or longer.',
      'Using all six letters is worth the most. The highest score wins.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  filler: {
    how: [
      'You start in one corner and your friend in the opposite one. Everything of your colour that touches your region is yours.',
      'Pick a new colour: your region turns that colour and takes in every touching square of it.',
      'Take more than half the board to win. You cannot pick your own colour or theirs.',
    ],
    pool: DUEL,
    poolMinKobo: 100 * NAIRA,
  },
  'crazy-cards': {
    how: [
      'Match the top card by colour or number, or play a wild card.',
      'Skip, reverse, draw two and the wild draw four change who plays next. Say “last card” when you have one left.',
      'The first to play all their cards wins.',
    ],
    pool: ROOM,
    poolMinKobo: 200 * NAIRA,
  },
  whot: {
    how: [
      'Match the top card by shape or number. Whot (20) lets you choose any shape.',
      'Special cards: pick two, pick three, hold on, suspension and general market make others pick up or miss a turn.',
      'Call “last card” when you have one left, and “check up” when you are out. The first to empty their hand wins.',
    ],
    pool: ROOM,
    poolMinKobo: 200 * NAIRA,
  },
  charades: {
    how: [
      'Two teams. One player gets a word and acts it out, or holds the phone up to their forehead while the team shouts it.',
      'No talking while acting. Tilt or tap when your team gets it.',
      'The team with the most words at the end wins. The Naija pack has words you know.',
    ],
    pool: SIDE,
    poolMinKobo: 200 * NAIRA,
  },
  imposter: {
    how: [
      'Everyone gets a secret word except the imposter, who gets nothing.',
      'Each round, give a one-word clue that proves you know the word without giving it away.',
      'Then vote. Find the imposter and you win; if they blend in, they do.',
    ],
    pool: SIDE,
    poolMinKobo: 300 * NAIRA,
  },
  werewolf: {
    how: [
      'Everyone gets a secret role: villager, werewolf, seer or doctor.',
      'Night: the werewolves pick someone to eat, the seer looks at someone, the doctor protects someone.',
      'Day: talk it out and vote someone out. Villagers win when the wolves are gone; wolves win when they match the villagers.',
    ],
    pool: SIDE,
    poolMinKobo: 500 * NAIRA,
  },
  'doodle-guess': {
    how: [
      'One player gets a word and draws it. Everyone else guesses in the chat.',
      'The faster you guess, the more points you earn, and the drawer earns points when people guess.',
      'Everyone draws in turn. The most points at the end wins.',
    ],
    pool: ROOM,
    poolMinKobo: 100 * NAIRA,
  },
  _example: {
    how: [
      'Roll the die as many times as you like to build up your turn total.',
      'Roll a 1 and you lose the turn total and the turn passes. Hold to bank it.',
      'First to reach the target wins. This is the developer test game and is not in the app.',
    ],
    pool: 'Not available.',
    poolMinKobo: null,
  },
};

/** The shipping names of the games, for the drawer's "coming soon" tiles and anywhere a slug needs a label. */
export const GAME_NAMES: Record<GameSlug, string> = {
  'cup-pong': 'Cup Pong',
  'eight-ball': '8 Ball',
  darts: 'Darts',
  basketball: 'Basketball',
  archery: 'Archery',
  'mini-golf': 'Mini Golf',
  tanks: 'Tanks',
  'sea-battle': 'Sea Battle',
  chess: 'Chess',
  checkers: 'Checkers',
  ayo: 'Ayo',
  ludo: 'Ludo',
  'dots-and-boxes': 'Dots & Boxes',
  'word-tiles': 'Word Tiles',
  'word-hunt': 'Word Hunt',
  anagrams: 'Anagrams',
  filler: 'Filler',
  'crazy-cards': 'Crazy Cards',
  whot: 'Whot!',
  charades: 'Charades',
  imposter: 'Imposter',
  werewolf: 'Werewolf',
  'doodle-guess': 'Doodle Guess',
  _example: 'Pig',
};

/** The rules for a slug, or null when the slug is not one this build knows. */
export function rulesFor(slug: string): GameRules | null {
  return (GAME_RULES as Record<string, GameRules | undefined>)[slug] ?? null;
}

/** "You both stake the same amount and the winner takes the pot. A draw gives both stakes back. Minimum ₦500." */
export function poolRulesLine(rules: GameRules, serverMinKobo?: number | null): string {
  const min = serverMinKobo ?? rules.poolMinKobo;
  return min === null ? rules.pool : `${rules.pool} Minimum stake ${formatNaira(min)}.`;
}
