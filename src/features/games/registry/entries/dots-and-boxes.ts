import { defineGame } from '../define';
import { DotsArt } from '../../boards/DotsArt';
import { DotsBoard } from '../../boards/DotsBoard';
import { dotsScoreLine, parseDotsView, type DotsView } from '../../boards/dots-logic';

/** Dots & Boxes: the whole state is public; a box you close scores and gives you another line. */
export const entry = defineGame<DotsView>({
  slug: 'dots-and-boxes',
  Board: DotsBoard,
  Art: DotsArt,
  parseView: parseDotsView,
  scoreLine: dotsScoreLine,
});
