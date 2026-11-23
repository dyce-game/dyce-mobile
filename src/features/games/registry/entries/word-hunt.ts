import { WordHuntGameArt, WordHuntGameBoard } from '../legacy-boards';
import { defineGame } from '../define';
import { WordHuntResultWords } from '../../boards/WordHuntResultWords';
import {
  parseWordHuntView,
  wordHuntMover,
  wordHuntScoreLine,
  type WordHuntView,
} from '../../games-logic';

/** Word Hunt: both players play at once, so "whose move" comes from the view (`wordHuntMover`). */
export const entry = defineGame<WordHuntView>({
  slug: 'word-hunt',
  Board: WordHuntGameBoard,
  Art: WordHuntGameArt,
  parseView: parseWordHuntView,
  mover: wordHuntMover,
  scoreLine: wordHuntScoreLine,
  ResultExtras: WordHuntResultWords,
});
