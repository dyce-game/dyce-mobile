import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { MatchPlayer, MatchView } from '@dyce/shared';
import type { GameSlug } from './rules';

/**
 * What the game host hands to a board. A board draws the server's `view` and sends moves through `onMove`;
 * it never decides an outcome. The host adds the shell (header, invite, result redirect, error line).
 */
export type BoardProps<V = unknown> = {
  matchId: string;
  match: MatchView;
  /** The server's view for you, already parsed by the entry's `parseView`. */
  view: V;
  players: MatchPlayer[];
  myId: string | null;
  /** The match is active and `match.currentTurn` is you. Games where both play at once decide from `view`. */
  yourTurn: boolean;
  /** A move is on its way to the server. */
  busy: boolean;
  /** The last move was refused or never arrived. */
  moveFailed: boolean;
  /** Send a move. The host adds `expectedVersion`; the action is the engine's wire action. */
  onMove: (action: Record<string, unknown>) => void;
  /** A board that animates the last move calls this when it is done, so the host may show the result. */
  onSettled?: () => void;
};

/** The picture for a game: the drawer tile, the mode sheet, the chat card and the result hero. */
export type ArtProps = {
  style?: StyleProp<ViewStyle>;
  /** The smaller layout used on chat cards. */
  compact?: boolean;
  /** A size hint in points for the main shape (a die, a tile), for very small frames. */
  dice?: number;
  /** The large picture on the results screen. */
  hero?: boolean;
};

export type ResultExtrasProps<V> = {
  view: V;
  myId: string | null;
  nameOf: (id: string) => string;
};

/**
 * Everything the platform needs to know about one game in the app. A game with only a `slug` (and its rules,
 * which live in `rules.ts`) is "coming soon": known, but with no board yet. A renderer session fills in
 * `Board`, `Art` and `parseView` in `entries/<slug>.ts` and nothing else; see docs/ADDING_A_GAME.md.
 */
export type GameEntry<V = unknown> = {
  slug: GameSlug;
  /** The play surface. Absent = the game has no board in this build. */
  Board?: ComponentType<BoardProps<V>>;
  /** Drawer tile, mode sheet, chat card, results hero. Absent = a plain felt panel. */
  Art?: ComponentType<ArtProps>;
  /** Turns the server's `match.view` into the board's own type; null when it is not recognised. */
  parseView?: (view: unknown) => V | null;
  /**
   * Whose move it is, for games where `match.currentTurn` is not enough (both players act at once, as in Word
   * Hunt, Anagrams and the placing phase of Sea Battle). Used by the chat card. Default: `match.currentTurn`.
   */
  mover?: (view: V, myId: string | null) => string | null;
  /** "You 38 · Zainab 41", for the line under the result. Null when there is nothing to say. */
  scoreLine?: (view: V, myId: string | null, nameOf: (id: string) => string) => string | null;
  /** More on the results screen under the score (Word Hunt lists the words). */
  ResultExtras?: ComponentType<ResultExtrasProps<V>>;
  /** Keep the host on the board after the match finishes (a last throw still animating); the result follows. */
  holdResult?: (matchId: string, view: V) => boolean;
  /** Wrap the board in a ScrollView (a board that is a plain column of cards). Default: the board fills the screen. */
  scroll?: boolean;
};

/**
 * An entry with its view type erased, which is how the registry stores them: the host only ever passes a view
 * through the same entry's own `parseView`, so the types line up at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameEntry = GameEntry<any>;
