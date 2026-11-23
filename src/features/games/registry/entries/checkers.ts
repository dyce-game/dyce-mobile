import { defineGame } from '../define';
import { CheckersArt } from '../../boards/CheckersArt';
import { CheckersBoard } from '../../boards/CheckersBoard';
import {
  checkersScoreLine,
  parseCheckersView,
  type CheckersView,
} from '../../boards/checkers-logic';

/** Checkers: the view lists every legal move (jumps only when one is forced); a multi-jump is one move. */
export const entry = defineGame<CheckersView>({
  slug: 'checkers',
  Board: CheckersBoard,
  Art: CheckersArt,
  parseView: parseCheckersView,
  scoreLine: checkersScoreLine,
});
