import { PigArt, PigGameBoard } from '../legacy-boards';
import { defineGame } from '../define';
import { parsePigView, scoreLine, type PigView } from '../../games-logic';

/** Pig, the reference game (dev builds only; the API hides it in production). */
export const entry = defineGame<PigView>({
  slug: '_example',
  Board: PigGameBoard,
  Art: PigArt,
  parseView: parsePigView,
  scoreLine,
  scroll: true,
});
