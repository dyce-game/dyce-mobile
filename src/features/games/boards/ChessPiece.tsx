import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/**
 * Chess pieces drawn as plain SVG silhouettes (not text glyphs: ♟ turns into an emoji on some phones). One
 * 100x100 drawing per piece; White is cream with a dark edge, Black is near-black with a light edge, so the two
 * sides differ in lightness and not only in hue.
 */

const WHITE = { fill: '#F6EBD6', edge: '#3A2A1A' };
const BLACK = { fill: '#2A211B', edge: '#E9DCC2' };

/** A piece's drawing for use inside another `Svg` (the art tile): 100x100 units, place it with a transform. */
export function ChessPieceShapes({ piece }: { piece: string }) {
  const white = piece === piece.toUpperCase();
  const { fill, edge } = white ? WHITE : BLACK;
  const stroke = { fill, stroke: edge, strokeWidth: 3.5, strokeLinejoin: 'round' as const };
  const t = piece.toLowerCase();
  return (
    <G>
      {t === 'p' ? (
        <>
          <Circle cx="50" cy="30" r="13" {...stroke} />
          <Path d="M36 80 C38 58 44 50 50 46 C56 50 62 58 64 80 Z" {...stroke} />
          <Rect x="28" y="80" width="44" height="9" rx="3" {...stroke} />
        </>
      ) : null}
      {t === 'r' ? (
        <>
          <Path
            d="M28 20 H39 V30 H45 V20 H55 V30 H61 V20 H72 V42 L65 48 V70 L74 78 V89 H26 V78 L35 70 V48 L28 42 Z"
            {...stroke}
          />
        </>
      ) : null}
      {t === 'n' ? (
        <>
          <Path
            d="M28 89 V80 C28 62 36 52 46 44 C40 44 34 46 28 54 L22 49 C26 36 34 26 46 21 L50 11 L58 21 C74 25 78 44 74 62 C72 72 73 82 75 89 Z"
            {...stroke}
          />
          <Circle cx="55" cy="30" r="2.6" fill={edge} />
        </>
      ) : null}
      {t === 'b' ? (
        <>
          <Circle cx="50" cy="14" r="5.5" {...stroke} />
          <Path
            d="M50 22 C66 33 68 48 59 58 C63 64 67 71 67 78 H33 C33 71 37 64 41 58 C32 48 34 33 50 22 Z"
            {...stroke}
          />
          <Path d="M44 40 L56 52" stroke={edge} strokeWidth={3} strokeLinecap="round" />
          <Rect x="26" y="78" width="48" height="11" rx="3" {...stroke} />
        </>
      ) : null}
      {t === 'q' ? (
        <>
          <Path d="M24 36 L33 72 H67 L76 36 L63 55 L57 30 L50 54 L43 30 L37 55 Z" {...stroke} />
          <Circle cx="24" cy="32" r="5" {...stroke} />
          <Circle cx="37" cy="24" r="5" {...stroke} />
          <Circle cx="50" cy="20" r="5" {...stroke} />
          <Circle cx="63" cy="24" r="5" {...stroke} />
          <Circle cx="76" cy="32" r="5" {...stroke} />
          <Rect x="28" y="72" width="44" height="17" rx="3" {...stroke} />
        </>
      ) : null}
      {t === 'k' ? (
        <>
          <Rect x="46.5" y="6" width="7" height="24" rx="2" {...stroke} />
          <Rect x="39" y="13" width="22" height="7" rx="2" {...stroke} />
          <Path d="M50 30 C70 30 77 48 67 60 L73 76 H27 L33 60 C23 48 30 30 50 30 Z" {...stroke} />
          <Rect x="25" y="76" width="50" height="13" rx="3" {...stroke} />
        </>
      ) : null}
    </G>
  );
}

export function ChessPiece({ piece, size }: { piece: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <ChessPieceShapes piece={piece} />
    </Svg>
  );
}
