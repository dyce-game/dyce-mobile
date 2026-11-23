import { defineGame } from '../define';
import { ChessArt } from '../../boards/ChessArt';
import { ChessBoard } from '../../boards/ChessBoard';
import { chessScoreLine, parseChessView, type ChessView } from '../../boards/chess-logic';

/** Chess: the engine's `view` carries every legal move; the board offers those and sends `{kind:'move'}`. */
export const entry = defineGame<ChessView>({
  slug: 'chess',
  Board: ChessBoard,
  Art: ChessArt,
  parseView: parseChessView,
  scoreLine: chessScoreLine,
});
