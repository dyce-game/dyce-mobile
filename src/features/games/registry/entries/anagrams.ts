import { defineGame } from '../define';
import { AnagramsArt } from '../../boards/AnagramsArt';
import { AnagramsBoard } from '../../boards/AnagramsBoard';
import { AnagramsResultWords } from '../../boards/AnagramsResultWords';
import {
  anagramsMover,
  anagramsScoreLine,
  parseAnagramsView,
  type AnagramsView,
} from '../../boards/anagrams-logic';

/** Anagrams: both players play at once, so "whose move" comes from the view (`anagramsMover`). */
export const entry = defineGame<AnagramsView>({
  slug: 'anagrams',
  Board: AnagramsBoard,
  Art: AnagramsArt,
  parseView: parseAnagramsView,
  mover: anagramsMover,
  scoreLine: anagramsScoreLine,
  ResultExtras: AnagramsResultWords,
});
