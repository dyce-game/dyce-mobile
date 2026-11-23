import type { GameSlug } from './rules';
import type { AnyGameEntry } from './types';
import { entry as cupPong } from './entries/cup-pong';
import { entry as eightBall } from './entries/eight-ball';
import { entry as darts } from './entries/darts';
import { entry as basketball } from './entries/basketball';
import { entry as archery } from './entries/archery';
import { entry as miniGolf } from './entries/mini-golf';
import { entry as tanks } from './entries/tanks';
import { entry as seaBattle } from './entries/sea-battle';
import { entry as chess } from './entries/chess';
import { entry as checkers } from './entries/checkers';
import { entry as ayo } from './entries/ayo';
import { entry as ludo } from './entries/ludo';
import { entry as dotsAndBoxes } from './entries/dots-and-boxes';
import { entry as wordTiles } from './entries/word-tiles';
import { entry as wordHunt } from './entries/word-hunt';
import { entry as anagrams } from './entries/anagrams';
import { entry as filler } from './entries/filler';
import { entry as crazyCards } from './entries/crazy-cards';
import { entry as whot } from './entries/whot';
import { entry as charades } from './entries/charades';
import { entry as imposter } from './entries/imposter';
import { entry as werewolf } from './entries/werewolf';
import { entry as doodleGuess } from './entries/doodle-guess';
import { entry as pig } from './entries/_example';

/**
 * The board registry: every game the app knows, by slug. The host, the result screen, the chat card and the
 * drawer read everything per-game from here, so a renderer adds its game by filling in
 * `entries/<slug>.ts` and writing its own files, and edits nothing shared. Every slug in `rules.ts` has an
 * entry file (the type below makes a missing one a compile error).
 */
const ENTRIES: { [K in GameSlug]: AnyGameEntry } = {
  'cup-pong': cupPong,
  'eight-ball': eightBall,
  darts: darts,
  basketball: basketball,
  archery: archery,
  'mini-golf': miniGolf,
  tanks: tanks,
  'sea-battle': seaBattle,
  chess: chess,
  checkers: checkers,
  ayo: ayo,
  ludo: ludo,
  'dots-and-boxes': dotsAndBoxes,
  'word-tiles': wordTiles,
  'word-hunt': wordHunt,
  anagrams: anagrams,
  filler: filler,
  'crazy-cards': crazyCards,
  whot: whot,
  charades: charades,
  imposter: imposter,
  werewolf: werewolf,
  'doodle-guess': doodleGuess,
  _example: pig,
};

/** Games that are played in a Space (src/features/spaces), not from a chat card or the game host. */
const LIVE_SLUGS: ReadonlySet<string> = new Set([
  'crazy-cards',
  'whot',
  'charades',
  'imposter',
  'werewolf',
  'doodle-guess',
]);

/** The entry for a slug, or null for a game this build has never heard of (an old app, a newer server). */
export function gameEntry(slug: string): AnyGameEntry | null {
  return (ENTRIES as Record<string, AnyGameEntry | undefined>)[slug] ?? null;
}

/** True when this build has a board for the game. */
export function hasBoard(slug: string): boolean {
  return !!gameEntry(slug)?.Board;
}

/** True for a game played in a Space instead of from a chat. */
export function isLiveGame(slug: string): boolean {
  return LIVE_SLUGS.has(slug);
}

/**
 * The games the drawer lists as "coming soon" in dev builds: known, with rules, but no board yet (live games
 * are played in Spaces and Pig is the dev reference). Always empty in production; the server also hides a
 * game until its row is enabled.
 */
export function comingSoonSlugs(): GameSlug[] {
  if (!__DEV__) return [];
  return (Object.keys(ENTRIES) as GameSlug[]).filter(
    (slug) => !ENTRIES[slug].Board && slug !== '_example' && !LIVE_SLUGS.has(slug),
  );
}

export { rulesFor, GAME_NAMES, GAME_RULES, poolRulesLine } from './rules';
export type { GameSlug } from './rules';
export type { AnyGameEntry, ArtProps, BoardProps, GameEntry } from './types';
