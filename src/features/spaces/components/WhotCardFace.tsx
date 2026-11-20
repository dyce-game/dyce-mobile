import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import type { WhotCard, WhotShape } from '@dyce/games';
import { Text } from '@dyce/ui';
import { cardLabel } from '../whot-logic';

/** Whot card colours (design: Card). The cards are the same in both themes: paper with maroon ink. */
export const WHOT_PAPER = '#F7EEDB';
export const WHOT_INK = '#6A1424';
const SHAPE_FILL = '#7A1E2E';
export const WHOT_BACK = '#6A1424';
const BACK_EDGE = '#F3E6CC';

/** One shape in a 24 x 24 box, drawn the way the design does. */
export function ShapeGlyph({
  shape,
  size,
  color = SHAPE_FILL,
}: {
  shape: WhotShape;
  size: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      {shape === 'circle' ? <Circle cx={12} cy={12} r={10} /> : null}
      {shape === 'triangle' ? <Polygon points="12,2 22.5,21 1.5,21" /> : null}
      {shape === 'cross' ? <Path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" /> : null}
      {shape === 'square' ? <Rect x={3} y={3} width={18} height={18} /> : null}
      {shape === 'star' ? (
        <Polygon points="12,1.5 14.9,8.6 22.5,9.2 16.7,14.1 18.5,21.6 12,17.6 5.5,21.6 7.3,14.1 1.5,9.2 9.1,8.6" />
      ) : null}
    </Svg>
  );
}

/**
 * A Whot card, 2:3. Face up: the number and shape in two corners and a big shape in the middle; the Whot
 * card says WHOT. Face down: the maroon back. The label is read out ("7 of circles"), so the shape is never
 * the only signal.
 */
export function WhotCardFace({
  card,
  width,
  faceDown,
}: {
  card?: WhotCard;
  width: number;
  faceDown?: boolean;
}) {
  const height = Math.round(width * 1.5);
  const radius = width * 0.12;
  if (faceDown || !card) {
    return (
      <View
        accessible
        accessibilityLabel="A card, face down"
        style={[
          styles.card,
          {
            width,
            height,
            borderRadius: radius,
            backgroundColor: WHOT_BACK,
            borderColor: BACK_EDGE,
          },
        ]}
      >
        <View
          style={{
            width: width * 0.56,
            height: width * 0.56,
            borderRadius: width * 0.1,
            transform: [{ rotate: '45deg' }],
            backgroundColor: BACK_EDGE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              transform: [{ rotate: '-45deg' }],
              color: WHOT_BACK,
              fontFamily: 'BricolageGrotesque_800ExtraBold',
              fontSize: Math.max(8, width * 0.14),
            }}
          >
            WHOT
          </Text>
        </View>
      </View>
    );
  }
  const whot = card.shape === 'whot';
  const corner = Math.max(9, width * 0.22);
  const glyph = Math.max(8, width * 0.2);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={cardLabel(card)}
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: WHOT_PAPER,
          borderColor: '#00000024',
        },
      ]}
    >
      <View
        style={[styles.inner, { borderRadius: radius * 0.7, borderColor: 'rgba(106,20,36,0.4)' }]}
      />
      <View style={[styles.corner, { left: width * 0.1, top: width * 0.08 }]}>
        <Text style={[styles.num, { fontSize: corner }]}>{card.n}</Text>
        {!whot ? (
          <ShapeGlyph shape={card.shape as WhotShape} size={glyph} color={WHOT_INK} />
        ) : null}
      </View>
      <View
        style={[
          styles.corner,
          { right: width * 0.1, bottom: width * 0.08, transform: [{ rotate: '180deg' }] },
        ]}
      >
        <Text style={[styles.num, { fontSize: corner }]}>{card.n}</Text>
        {!whot ? (
          <ShapeGlyph shape={card.shape as WhotShape} size={glyph} color={WHOT_INK} />
        ) : null}
      </View>
      <View style={styles.center}>
        {whot ? (
          <Text
            style={{
              color: WHOT_INK,
              fontFamily: 'BricolageGrotesque_800ExtraBold',
              fontSize: Math.max(10, width * 0.24),
              letterSpacing: 1,
            }}
          >
            WHOT
          </Text>
        ) : (
          <ShapeGlyph shape={card.shape as WhotShape} size={width * 0.46} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inner: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderWidth: 1 },
  corner: { position: 'absolute', alignItems: 'center', gap: 1 },
  num: { color: WHOT_INK, fontFamily: 'BricolageGrotesque_800ExtraBold', lineHeight: undefined },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
