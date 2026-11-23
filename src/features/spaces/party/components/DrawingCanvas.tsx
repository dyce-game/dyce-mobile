import { memo, useMemo, useRef } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { CanvasStroke } from '@dyce/games';
import { colorHex, strokePath, strokePx, toCanvasPoint, type Pt } from '../doodle-logic';

export type TouchPhase = 'start' | 'move' | 'end';

const Stroke = memo(function Stroke({ stroke, size }: { stroke: CanvasStroke; size: number }) {
  return (
    <Path
      d={strokePath(stroke.pts, size)}
      stroke={colorHex(stroke.color)}
      strokeWidth={strokePx(stroke.width, size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
});

/**
 * The drawing surface: a white square (the same shape on every phone, so a drawing looks the same to
 * everyone) that shows `strokes` and, when `onTouch` is given, turns finger movement into points on the
 * server's 0..1000 grid. It draws with react-native-svg, not Skia: see ADR-026. Dragging is one way to
 * draw; the shapes panel on the screen is the other. The strokes are never made of anything but the points
 * that were sent, so what the drawer sees is what the others get.
 */
export function DrawingCanvas({
  size,
  strokes,
  onTouch,
  label,
}: {
  size: number;
  strokes: readonly CanvasStroke[];
  /** Present only for the drawer, in the draw phase. */
  onTouch?: (phase: TouchPhase, point: Pt) => void;
  label: string;
}) {
  const live = useRef({ size, onTouch });
  live.current = { size, onTouch };
  const last = useRef<Pt>([0, 0]);

  const pan = useMemo(() => {
    const point = (e: { nativeEvent: { locationX: number; locationY: number } }): Pt =>
      toCanvasPoint(e.nativeEvent.locationX, e.nativeEvent.locationY, live.current.size);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !!live.current.onTouch,
      onMoveShouldSetPanResponder: () => !!live.current.onTouch,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        last.current = point(e);
        live.current.onTouch?.('start', last.current);
      },
      onPanResponderMove: (e) => {
        last.current = point(e);
        live.current.onTouch?.('move', last.current);
      },
      onPanResponderRelease: () => live.current.onTouch?.('end', last.current),
      onPanResponderTerminate: () => live.current.onTouch?.('end', last.current),
    });
  }, []);

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.canvas,
        { width: size, height: size },
        Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as object) : null,
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size}>
          {strokes.map((s, i) => (
            <Stroke key={`${s.id}-${i}`} stroke={s} size={size} />
          ))}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
});
