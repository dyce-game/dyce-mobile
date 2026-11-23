import { useState, type ReactNode } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@dyce/ui';
import { Canvas } from '../r3f';
import { SceneBoundary } from '../r3f-common/webgl';
import { GLASS, GLASS_EDGE, INK } from '../r3f-common/hud';

/**
 * The stage for the 3D board games (Sea Battle, Ayo/Mancala, Ludo): a canvas in the band between the glass HUD
 * on top and the controls underneath, the flat picture and a clear message when there is no WebGL, and a slot
 * for accessible buttons that sit exactly over things in the scene (they are positioned by projecting the
 * scene's camera, so what you tap is what a screen reader reads). The room is a fixed dark scene in both
 * themes, as in the designs and as in the sports boards (ADR-020).
 *
 * Draw order, bottom to top: scene (or flat picture), `onScenePress` touch surface, `overlay` (inside the
 * canvas band, in the band's own coordinates), `top`, `banner`, `bottom`.
 */
export type SceneBand = { width: number; height: number };

export function Stage3D({
  room,
  sceneLabel,
  sceneOk,
  onSceneError,
  scene,
  flat,
  fallbackText,
  onScenePress,
  overlay,
  top,
  banner,
  bottom,
}: {
  room: string;
  /** What a screen reader hears for the whole picture. */
  sceneLabel: string;
  sceneOk: boolean;
  onSceneError: () => void;
  /** The contents of the canvas, given the size of the band so a camera can fit it. */
  scene: (band: SceneBand) => ReactNode;
  /** The flat view shown without WebGL, given the band too. */
  flat: (band: SceneBand) => ReactNode;
  /** The sentence shown when 3D is not available (say how to play in the flat view). */
  fallbackText: string;
  /** A tap on the scene surface, in band coordinates. Absent when taps are handled by overlay buttons. */
  onScenePress?: (x: number, y: number, band: SceneBand) => void;
  /** Accessible controls over the scene, in band coordinates. */
  overlay?: (band: SceneBand) => ReactNode;
  top: ReactNode;
  banner?: ReactNode;
  bottom: ReactNode;
}) {
  const [topH, setTopH] = useState(120);
  const [bottomH, setBottomH] = useState(160);
  const [stage, setStage] = useState({ width: 390, height: 700 });
  const bandH = Math.max(120, stage.height - topH - bottomH);
  const band: SceneBand = { width: stage.width, height: bandH };

  return (
    <View
      style={[styles.stage, { backgroundColor: room }]}
      onLayout={(e: LayoutChangeEvent) =>
        setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      <View style={[styles.band, { top: topH, height: bandH }]}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={sceneLabel}
        >
          {sceneOk ? (
            <SceneBoundary onError={onSceneError}>
              <Canvas frameloop="demand" gl={{ antialias: true }}>
                {scene(band)}
              </Canvas>
            </SceneBoundary>
          ) : (
            flat(band)
          )}
        </View>
        {sceneOk && onScenePress ? (
          <Pressable
            style={[StyleSheet.absoluteFill, webTouch]}
            onPress={(e) => {
              const p = pressPoint(e);
              if (p) onScenePress(p.x, p.y, band);
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
        {overlay ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {overlay(band)}
          </View>
        ) : null}
      </View>

      <View
        style={styles.topWrap}
        pointerEvents="box-none"
        onLayout={(e) => setTopH(Math.ceil(e.nativeEvent.layout.height) + 14)}
      >
        {top}
        {!sceneOk ? (
          <View style={styles.notice} accessible accessibilityRole="alert">
            <Text variant="footnote" color={INK} style={styles.center}>
              {fallbackText}
            </Text>
          </View>
        ) : null}
      </View>

      {banner}

      <View
        style={styles.bottom}
        pointerEvents="box-none"
        onLayout={(e) => setBottomH(Math.ceil(e.nativeEvent.layout.height) + 20)}
      >
        {bottom}
      </View>
    </View>
  );
}

/** Where a press landed inside the surface: React Native gives locationX/Y, the web gives a click to measure. */
function pressPoint(e: GestureResponderEvent): { x: number; y: number } | null {
  const n = e.nativeEvent as unknown as Record<string, number | undefined>;
  if (Number.isFinite(n.locationX) && Number.isFinite(n.locationY)) {
    return { x: n.locationX as number, y: n.locationY as number };
  }
  const t = e.currentTarget as unknown as { getBoundingClientRect?: () => DOMRect };
  if (t?.getBoundingClientRect && Number.isFinite(n.clientX) && Number.isFinite(n.clientY)) {
    const r = t.getBoundingClientRect();
    return { x: (n.clientX as number) - r.left, y: (n.clientY as number) - r.top };
  }
  return null;
}

const webTouch = Platform.select({
  web: { userSelect: 'none', cursor: 'pointer', touchAction: 'manipulation' } as never,
  default: {},
});

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0 },
  topWrap: { position: 'absolute', left: 12, right: 12, top: 10, gap: 8 },
  notice: {
    padding: 10,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  center: { textAlign: 'center' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 14, gap: 10 },
});
