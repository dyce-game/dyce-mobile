import { defineGame } from '../define';
import { SeaBattleArt } from '../../boards/SeaBattleArt';
import { SeaBattleBoard } from '../../boards/SeaBattleBoard';
import { SeaBattleResult } from '../../boards/SeaBattleResult';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';
import {
  moverOf,
  parseSeaBattleView,
  seaBattleScoreLine,
  type SeaBattleView,
} from '../../boards/sea-battle-logic';

/**
 * Sea Battle (3D). Both players place their fleet at the same time, so the chat card asks `mover` whose move
 * it is; the host keeps the board up until the final shot has been shown.
 */
export const entry = defineGame<SeaBattleView>({
  slug: 'sea-battle',
  Board: SeaBattleBoard,
  Art: SeaBattleArt,
  parseView: parseSeaBattleView,
  mover: moverOf,
  scoreLine: seaBattleScoreLine,
  ResultExtras: SeaBattleResult,
  holdResult: (matchId, v) =>
    holdsForFinalShot(matchId, v.phase === 'over', v.last ? { seq: v.seq } : null),
});
