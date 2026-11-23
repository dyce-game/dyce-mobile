import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { CameraSpec } from './r3f-common/camera-math';
import { CameraRig, WakeOn, useFrame, useFrameMeter, useThree } from './r3f-common/scene-kit';
import { playbackOver, playbackSample, type Playback } from './r3f-common/shot-flow';
import { RING_R, boardToWorld, sampleDart, type DartPlanData, type Point } from './darts-logic';

/**
 * The dartboard in 3D (React Three Fiber): the board face is built once as one mesh with vertex colours, the
 * darts are a handful of primitives each. It only draws: the darts it is given, the dart in flight (from the
 * plan being played), the aim marker and the dart waiting in the hand. Metres, the board face is z = 0.
 */

/** Head-on at the board, a little above centre so it sits clear of the score panels. */
export const DARTS_CAMERA: CameraSpec = {
  target: [0, -0.075, 0],
  dir: [0, 0, 1],
  distance: 1.4,
  fovDeg: 30,
  fitWidth: 0.5,
};

const RED = '#C62828';
const GREEN = '#1E7A3E';
const BLACK = '#151515';
const CREAM = '#EFE3C2';

export type DartsSceneProps = {
  /** Darts standing in the board (where they landed, engine units). */
  stuck: readonly Point[];
  playbackRef: MutableRefObject<Playback<DartPlanData> | null>;
  playToken: number;
  onPlaybackEnd: (token: number) => void;
  /** The aim marker (engine units), or null. */
  aim: Point | null;
  /** The dart waits in the hand. */
  ready: boolean;
};

export function DartsScene({
  stuck,
  playbackRef,
  playToken,
  onPlaybackEnd,
  aim,
  ready,
}: DartsSceneProps) {
  return (
    <>
      <color attach="background" args={['#1E120A']} />
      <CameraRig spec={DARTS_CAMERA} />
      <WakeOn deps={[stuck, playToken, aim, ready]} />
      <ambientLight intensity={1.5} color="#FFE9CF" />
      <directionalLight position={[-0.4, 0.8, 1.5]} intensity={1.7} color="#FFF1DD" />
      <Wall />
      <Surround />
      <Face />
      {stuck.map((p, i) => (
        <Dart key={`${i}:${p.x}:${p.y}`} at={boardToWorld(p)} tilt={tiltFor(i)} />
      ))}
      <FlyingDart playbackRef={playbackRef} onEnd={onPlaybackEnd} />
      {ready ? <Dart at={[0.1, -0.2, 0.75]} tilt={[0.9, -0.35, 0.2]} /> : null}
      {aim ? <Reticle at={boardToWorld(aim, 0.006)} /> : null}
    </>
  );
}

const tiltFor = (i: number): [number, number, number] => [
  0.95 + (i % 3) * 0.1,
  (i % 2 === 0 ? -1 : 1) * (0.28 + (i % 3) * 0.08),
  i * 0.7,
];

function Wall() {
  return (
    <group position={[0, 0, -0.06]}>
      <mesh>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#2A1A10" roughness={1} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[(i - 5.5) * 0.24, 0, 0.001]}>
          <planeGeometry args={[0.006, 3]} />
          <meshBasicMaterial color="#160C06" />
        </mesh>
      ))}
    </group>
  );
}

function Surround() {
  return (
    <group>
      <mesh position={[0, 0, -0.012]}>
        <circleGeometry args={[0.285, 48]} />
        <meshStandardMaterial color="#3A2414" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, -0.004]}>
        <circleGeometry args={[0.232, 48]} />
        <meshStandardMaterial color="#0E0C0B" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---- the board face, one mesh -----------------------------------------------------------------------------

function buildFace(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const tri = (a: [number, number], b: [number, number], d: [number, number], z: number) => {
    pos.push(a[0], a[1], z, b[0], b[1], z, d[0], d[1], z);
  };
  const paint = (hex: string, n: number) => {
    c.set(hex);
    for (let i = 0; i < n; i++) col.push(c.r, c.g, c.b);
  };
  /** A piece of a ring: radii r0..r1, angles a0..a1 (degrees, clockwise from the top). */
  const piece = (r0: number, r1: number, a0: number, a1: number, hex: string, z: number) => {
    const n = Math.max(1, Math.ceil((a1 - a0) / 4.5));
    for (let k = 0; k < n; k++) {
      const s = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
      const e = ((a0 + ((a1 - a0) * (k + 1)) / n) * Math.PI) / 180;
      const p = (r: number, a: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];
      tri(p(r0, s), p(r1, s), p(r1, e), z);
      tri(p(r0, s), p(r1, e), p(r0, e), z);
      paint(hex, 6);
    }
  };
  for (let i = 0; i < 20; i++) {
    const a0 = i * 18 - 9;
    const a1 = i * 18 + 9;
    const even = i % 2 === 0;
    const ring = even ? RED : GREEN;
    const single = even ? BLACK : CREAM;
    piece(RING_R.doubleIn, RING_R.doubleOut, a0, a1, ring, 0);
    piece(RING_R.tripleOut, RING_R.doubleIn, a0, a1, single, 0);
    piece(RING_R.tripleIn, RING_R.tripleOut, a0, a1, ring, 0);
    piece(RING_R.bull, RING_R.tripleIn, a0, a1, single, 0);
  }
  piece(RING_R.dbull, RING_R.bull, 0, 360, GREEN, 0);
  piece(0, RING_R.dbull, 0, 360, RED, 0);
  // Wire: the rings and the 20 sector edges, a hair above the face.
  const WIRE = '#C9C9C9';
  for (const r of [
    RING_R.doubleOut,
    RING_R.doubleIn,
    RING_R.tripleOut,
    RING_R.tripleIn,
    RING_R.bull,
  ]) {
    piece(r - 0.0004, r + 0.0004, 0, 360, WIRE, 0.0004);
  }
  for (let i = 0; i < 20; i++) {
    const a = ((i * 18 - 9) * Math.PI) / 180;
    const nx = Math.cos(a) * 0.0003;
    const ny = -Math.sin(a) * 0.0003;
    const r0 = RING_R.bull;
    const r1 = RING_R.doubleOut;
    const x0 = Math.sin(a) * r0;
    const y0 = Math.cos(a) * r0;
    const x1 = Math.sin(a) * r1;
    const y1 = Math.cos(a) * r1;
    tri([x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], 0.0004);
    tri([x0 - nx, y0 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny], 0.0004);
    paint(WIRE, 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function Face() {
  const geo = useMemo(buildFace, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} />
    </mesh>
  );
}

// ---- darts ---------------------------------------------------------------------------------------------

/** A dart with its tip at the group's origin and the tail towards +z, turned by `tilt` (radians). */
function Dart({
  at,
  tilt,
}: {
  at: readonly [number, number, number];
  tilt: readonly [number, number, number];
}) {
  return (
    <group position={[at[0], at[1], at[2]]} rotation={[tilt[0], tilt[1], 0]}>
      <DartBody roll={tilt[2]} />
    </group>
  );
}

function DartBody({ roll }: { roll: number }) {
  return (
    <group>
      <mesh position={[0, 0, 0.014]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.0016, 0.028, 8]} />
        <meshStandardMaterial color="#D8DDE4" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0038, 0.0034, 0.045, 12]} />
        <meshStandardMaterial color="#9AA0AA" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.088]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.03, 8]} />
        <meshStandardMaterial color="#1B140F" roughness={0.6} />
      </mesh>
      <group position={[0, 0, 0.115]} rotation={[0, 0, roll]}>
        {[0, Math.PI / 2].map((r) => (
          <mesh key={r} rotation={[0, 0, r]}>
            <planeGeometry args={[0.03, 0.034]} />
            <meshStandardMaterial color="#C93E1C" side={THREE.DoubleSide} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The dart in the air, then in the board where it landed, for as long as its plan is the one on screen. */
function FlyingDart({
  playbackRef,
  onEnd,
}: {
  playbackRef: MutableRefObject<Playback<DartPlanData> | null>;
  onEnd: (token: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const tick = useFrameMeter('__darts');
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const pb = playbackRef.current;
    if (!pb) {
      g.visible = false;
      return;
    }
    const now = performance.now();
    const p = playbackSample(pb, now, sampleDart);
    g.visible = true;
    g.position.set(p[0] as number, p[1] as number, p[2] as number);
    // Level out as it arrives: steep in the hand, settled to the resting tilt in the board.
    const s = Math.min(1, (now - pb.startedAt) / pb.plan.durationMs);
    g.rotation.set(0.9 + 0.05 * s, -0.35 + 0.1 * s, 0);
    if (playbackOver(pb, now)) {
      if (!pb.done) {
        pb.done = true;
        onEnd(pb.token);
      }
    } else {
      tick(pb.token);
      invalidate();
    }
  });
  return (
    <group ref={group} visible={false}>
      <DartBody roll={0.4} />
    </group>
  );
}

function Reticle({ at }: { at: readonly [number, number, number] }) {
  const r = 0.011;
  return (
    <group position={[at[0], at[1], at[2]]} renderOrder={10}>
      <mesh>
        <ringGeometry args={[r, r + 0.0022, 32]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[r + 0.0022, r + 0.0036, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} depthTest={false} />
      </mesh>
      {[0, Math.PI / 2].map((a) => (
        <mesh key={a} rotation={[0, 0, a]}>
          <planeGeometry args={[r * 2.8, 0.0014]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}
