import { defineGame } from '../define';
import { EightBallArt } from '../../boards/EightBallArt';
import { EightBallBoard } from '../../boards/EightBallBoard';
import { EightBallResult } from '../../boards/EightBallResult';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';
import {
  eightBallScoreLine,
  parseEightBallView,
  type EightBallView,
} from '../../boards/eight-ball-logic';

/** 8 Ball (3D): the host holds the result back until the last shot has played out. */
export const entry = defineGame<EightBallView>({
  slug: 'eight-ball',
  Board: EightBallBoard,
  Art: EightBallArt,
  parseView: parseEightBallView,
  scoreLine: eightBallScoreLine,
  ResultExtras: EightBallResult,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, v.over, v.last),
});
