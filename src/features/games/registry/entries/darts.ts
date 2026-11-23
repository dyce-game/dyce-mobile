import { defineGame } from '../define';
import { DartsArt } from '../../boards/DartsArt';
import { DartsBoard } from '../../boards/DartsBoard';
import { DartsResult } from '../../boards/DartsResult';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';
import { dartsScoreLine, parseDartsView, type DartsView } from '../../boards/darts-logic';

/** Darts (3D): the host holds the result back until the last dart has landed. */
export const entry = defineGame<DartsView>({
  slug: 'darts',
  Board: DartsBoard,
  Art: DartsArt,
  parseView: parseDartsView,
  scoreLine: dartsScoreLine,
  ResultExtras: DartsResult,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, v.over, v.last),
});
