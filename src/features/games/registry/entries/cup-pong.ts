import { CupPongGameArt, CupPongGameBoard } from '../legacy-boards';
import { defineGame } from '../define';
import {
  cupPongScoreLine,
  holdsForFinalThrow,
  parseCupPongView,
  type CupPongView,
} from '../../boards/cup-pong-logic';

/** Cup Pong (3D): the host holds the result back until the last throw has played out. */
export const entry = defineGame<CupPongView>({
  slug: 'cup-pong',
  Board: CupPongGameBoard,
  Art: CupPongGameArt,
  parseView: parseCupPongView,
  scoreLine: cupPongScoreLine,
  holdResult: holdsForFinalThrow,
});
