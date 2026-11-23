import { defineGame } from '../define';
import { LudoArt } from '../../boards/LudoArt';
import { LudoBoard } from '../../boards/LudoBoard';
import { ludoScoreLine, moverOf, parseLudoView, type LudoView } from '../../boards/ludo-logic';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';

/**
 * Ludo (3D, two players async). The same board draws three and four players (`view.players`), which is what
 * the live Spaces room will use (docs/BACKLOG.md). The host keeps the board up until the last move has been
 * shown.
 */
export const entry = defineGame<LudoView>({
  slug: 'ludo',
  Board: LudoBoard,
  Art: LudoArt,
  parseView: parseLudoView,
  mover: (v) => moverOf(v),
  scoreLine: ludoScoreLine,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, v.over, v.last ? { seq: v.seq } : null),
});
