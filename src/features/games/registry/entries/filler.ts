import { defineGame } from '../define';
import { FillerArt } from '../../boards/FillerArt';
import { FillerBoard } from '../../boards/FillerBoard';
import { fillerScoreLine, parseFillerView, type FillerView } from '../../boards/filler-logic';

/** Filler: perfect information; the view is the state plus each player's count. */
export const entry = defineGame<FillerView>({
  slug: 'filler',
  Board: FillerBoard,
  Art: FillerArt,
  parseView: parseFillerView,
  scoreLine: fillerScoreLine,
});
