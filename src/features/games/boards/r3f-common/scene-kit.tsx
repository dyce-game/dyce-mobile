import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '../r3f';
import { cameraPose, type CameraSpec, type V3 } from './camera-math';

/**
 * Small pieces every sports scene uses. They live here, in `r3f-common`, so the boards share them without
 * touching Cup Pong's own files.
 */

/** Places the three.js camera from a `CameraSpec`: the touch layer computes the same pose from the same spec. */
export function CameraRig({ spec }: { spec: CameraSpec }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const pose = cameraPose(spec, size.width, size.height);
    cam.position.set(...pose.position);
    cam.lookAt(...pose.target);
    cam.fov = pose.fovDeg;
    cam.near = 0.05;
    cam.far = 400;
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, spec, size.width, size.height, invalidate]);
  return null;
}

/** Wakes an on-demand canvas when something it draws changed. */
export function WakeOn({ deps }: { deps: readonly unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [invalidate, ...deps]);
  return null;
}

/** The aim guide: fading dots along a predicted path, in world metres. */
export function GuideDots({
  points,
  radius = 0.011,
  color = '#FFFFFF',
}: {
  points: readonly V3[];
  radius?: number;
  color?: string;
}) {
  return (
    <group>
      {points.map((p, i) => {
        const t = points.length > 1 ? i / (points.length - 1) : 0;
        return (
          <mesh key={i} position={[p[0], p[1], p[2]]}>
            <sphereGeometry args={[radius * (1 - 0.5 * t), 8, 6]} />
            <meshBasicMaterial color={color} transparent opacity={0.85 - 0.55 * t} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Dev only: frame times while a shot plays, left on `globalThis[name]` for the frame-rate check (average and
 * worst frame, draw calls and triangles). Nothing is shipped or sent anywhere. Call `tick(token)` every frame
 * the animation runs.
 */
export function useFrameMeter(name: string) {
  const gl = useThree((s) => s.gl);
  const m = useRef({ token: -1, last: 0, first: 0, frames: 0, worstMs: 0 });
  return (token: number) => {
    if (!__DEV__) return;
    const now = performance.now();
    const s = m.current;
    if (s.token !== token) {
      s.token = token;
      s.last = 0;
      s.first = now;
      s.frames = 0;
      s.worstMs = 0;
    }
    if (s.last) s.worstMs = Math.max(s.worstMs, now - s.last);
    s.last = now;
    s.frames++;
    const elapsed = Math.max(1, now - s.first);
    (globalThis as Record<string, unknown>)[name] = {
      token,
      frames: s.frames,
      elapsedMs: Math.round(elapsed),
      avgFps: Math.round((s.frames / elapsed) * 1000),
      worstFrameMs: Math.round(s.worstMs),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
    };
  };
}

export { useFrame, useThree };
