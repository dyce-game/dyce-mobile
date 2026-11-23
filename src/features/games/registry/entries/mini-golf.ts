import { defineGame } from '../define';
import { MiniGolfArt } from '../../boards/MiniGolfArt';
import { MiniGolfBoard } from '../../boards/MiniGolfBoard';
import {
  holdsForFinalPutt,
  miniGolfScoreLine,
  parseMiniGolfView,
  type MiniGolfView,
} from '../../boards/mini-golf-logic';

/**
 * Mini Golf: 2 to 4 players. `match.currentTurn` stays on one player for their whole hole, which is what the
 * chat card should say, so there is no `mover`.
 */
export const entry = defineGame<MiniGolfView>({
  slug: 'mini-golf',
  Board: MiniGolfBoard,
  Art: MiniGolfArt,
  parseView: parseMiniGolfView,
  scoreLine: miniGolfScoreLine,
  holdResult: holdsForFinalPutt, // the last putt rolls before the result shows
});
