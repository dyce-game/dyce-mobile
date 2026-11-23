import type { ReactNode } from 'react';
import {
  type GestureResponderHandlers,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@dyce/ui';
import { Canvas } from '../r3f';
import { SceneBoundary } from './webgl';
import { GLASS, GLASS_EDGE, INK } from './hud';

/**
 * The stage every 3D sports board sits in: the canvas (or, without WebGL, a flat view and a message), the
 * touch surface over it, and the slots for the HUD on top and the controls underneath. Draw order, bottom to
 * top: scene, touch surface, `overlay` (labels that follow the scene; they never take touches), `top`,
 * `banner`, `bottom`.
 */
export function BoardFrame({
  room,
  sceneLabel,
  sceneOk,
  onSceneError,
  scene,
  flat,
  touch,
  cursor = 'grab',
  onLayout,
  overlay,
  top,
  banner,
  bottom,
}: {
  /** The room colour behind everything. */
  room: string;
  /** What a screen reader hears for the whole scene. */
  sceneLabel: string;
  sceneOk: boolean;
  onSceneError: () => void;
  /** The contents of the canvas. */
  scene: ReactNode;
  /** The flat, slider-driven picture shown when 3D is not available. */
  flat: ReactNode;
  touch?: GestureResponderHandlers;
  cursor?: 'grab' | 'crosshair' | 'pointer';
  onLayout: (e: LayoutChangeEvent) => void;
  overlay?: ReactNode;
  top: ReactNode;
  banner?: ReactNode;
  bottom: ReactNode;
}) {
  return (
    <View style={[styles.stage, { backgroundColor: room }]} onLayout={onLayout}>
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={sceneLabel}
      >
        {sceneOk ? (
          <SceneBoundary onError={onSceneError}>
            <Canvas frameloop="demand" gl={{ antialias: true }}>
              {scene}
            </Canvas>
          </SceneBoundary>
        ) : (
          flat
        )}
      </View>

      {sceneOk && touch ? (
        <View
          style={[StyleSheet.absoluteFill, webTouch(cursor)]}
          {...touch}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}

      {overlay ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {overlay}
        </View>
      ) : null}

      <View style={styles.topWrap} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          {top}
        </View>
        {!sceneOk ? (
          <View style={styles.notice} accessible accessibilityRole="alert">
            <Text variant="footnote" color={INK} style={styles.center}>
              3D isn&apos;t available on this device, so here is the flat view. Playing works the
              same: use the sliders.
            </Text>
          </View>
        ) : null}
      </View>

      {banner}

      <View style={styles.bottom} pointerEvents="box-none">
        {bottom}
      </View>
    </View>
  );
}

const webTouch = (cursor: string) =>
  Platform.select({
    web: { userSelect: 'none', cursor, touchAction: 'none' } as never,
    default: {},
  });

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  topWrap: { position: 'absolute', left: 12, right: 12, top: 10, gap: 8 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
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
