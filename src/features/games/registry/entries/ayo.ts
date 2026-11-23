import { defineGame } from '../define';
import { AyoArt } from '../../boards/AyoArt';
import { AyoBoard } from '../../boards/AyoBoard';
import { ayoScoreLine, isOver, moverOf, parseAyoView, type AyoView } from '../../boards/ayo-logic';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';

/**
 * Ayo Olopon (3D). The board also draws Mancala (Kalah) from `view.variant`, so the day the server can
 * create a match with that rule set (a per-match option, docs/BACKLOG.md) nothing changes in the app.
 * The host keeps the board up until the last sowing has been shown.
 */
export const entry = defineGame<AyoView>({
  slug: 'ayo',
  Board: AyoBoard,
  Art: AyoArt,
  parseView: parseAyoView,
  mover: (v) => moverOf(v),
  scoreLine: ayoScoreLine,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, isOver(v), v.last ? { seq: v.seq } : null),
});
