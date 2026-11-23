import { defineGame } from '../define';
import { ArcheryArt } from '../../boards/ArcheryArt';
import { ArcheryBoard } from '../../boards/ArcheryBoard';
import { ArcheryResult } from '../../boards/ArcheryResult';
import { holdsForFinalShot } from '../../boards/r3f-common/shot-flow';
import { archeryScoreLine, parseArcheryView, type ArcheryView } from '../../boards/archery-logic';

/** Archery (3D): the host holds the result back until the last arrow has landed. */
export const entry = defineGame<ArcheryView>({
  slug: 'archery',
  Board: ArcheryBoard,
  Art: ArcheryArt,
  parseView: parseArcheryView,
  scoreLine: archeryScoreLine,
  ResultExtras: ArcheryResult,
  holdResult: (matchId, v) => holdsForFinalShot(matchId, v.over, v.last),
});
