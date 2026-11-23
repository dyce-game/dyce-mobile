import { defineGame } from '../define';
import { BasketballArt } from '../../boards/BasketballArt';
import { BasketballBoard } from '../../boards/BasketballBoard';
import { BasketballResult } from '../../boards/BasketballResult';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';
import {
  basketballScoreLine,
  parseBasketballView,
  type BasketballView,
} from '../../boards/basketball-logic';

/** Basketball (3D): the host holds the result back until the last shot has played out. */
export const entry = defineGame<BasketballView>({
  slug: 'basketball',
  Board: BasketballBoard,
  Art: BasketballArt,
  parseView: parseBasketballView,
  scoreLine: basketballScoreLine,
  ResultExtras: BasketballResult,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, v.over, v.last),
});
