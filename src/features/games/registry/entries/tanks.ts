import { defineGame } from '../define';
import { TanksArt } from '../../boards/TanksArt';
import { TanksBoard } from '../../boards/TanksBoard';
import {
  holdsForFinalShot,
  parseTanksView,
  tanksScoreLine,
  type TanksView,
} from '../../boards/tanks-logic';

/** Tanks (2D): turn by turn; the host holds the result back until the last shot has landed. */
export const entry = defineGame<TanksView>({
  slug: 'tanks',
  Board: TanksBoard,
  Art: TanksArt,
  parseView: parseTanksView,
  scoreLine: tanksScoreLine,
  holdResult: holdsForFinalShot,
});
