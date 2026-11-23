import { defineGame } from '../define';
import { WordTilesArt } from '../../boards/WordTilesArt';
import { WordTilesBoard } from '../../boards/WordTilesBoard';
import {
  parseWordTilesView,
  wordTilesScoreLine,
  type WordTilesView,
} from '../../boards/word-tiles-logic';

/** Word Tiles: 2 to 4 players, one turn at a time (`match.currentTurn` is the whole story). */
export const entry = defineGame<WordTilesView>({
  slug: 'word-tiles',
  Board: WordTilesBoard,
  Art: WordTilesArt,
  parseView: parseWordTilesView,
  scoreLine: wordTilesScoreLine,
});
