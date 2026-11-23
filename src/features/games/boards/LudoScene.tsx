import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { CameraRig, WakeOn, useFrame, useFrameMeter, useThree } from './r3f-common/scene-kit';
import type { CameraSpec } from './r3f-common/camera-math';
import { easeOut, lerp, within } from './board3d/anim';
import {
  CAPTURE_FLY_MS,
  DIE_FACES,
  DIE_REST,
  HOME_COLUMN,
  NEUTRAL,
  PIPS,
  dieAt,
  hopAt,
  isStar,
  layoutPawns,
  ringCell,
  rotate,
  tokenCell,
  toWorld,
  type Event,
  type P,
} from './ludo-logic';

/**
 * Ludo in 3D (React Three Fiber): the cross-shaped board tilted towards you, a pawn per token, and a die in the
 * middle that tumbles and lands on what the server rolled. One unit is one cell. The board is drawn in "board"
 * coordinates (seat 0's yard top-left) and turned by `turns` quarter-turns so that your own yard is nearest to
 * you. The scene draws only what it is given: the tokens, the roll to show and, while the last event plays, an
 * `event` (a roll, or a move with its hop and any capture) that it animates by moving the pawns and the die
 * directly each frame, then calls `onDone`.
 */

export const LUDO_CAMERA: CameraSpec = {
  target: [0, 0, 0.4],
  dir: [0, Math.sin(0.92), Math.cos(0.92)],
  distance: 26,
  fovDeg: 30,
  fitWidth: 16.4,
};

const PAWN_Y = 0.08;

export type LudoSceneProps = {
  /** The tokens to draw (the board before the move while the move plays). */
  tokens: readonly (readonly number[])[];
  /** Each seat's quadrant (0..3, clockwise from the top-left) and colour. */
  quads: readonly number[];
  colors: readonly string[];
  /** Colour of every quadrant of the board (a seat's, or a neutral tint when nobody sits there). */
  quadColors: readonly string[];
  turns: number;
  /** Your seat and your tokens that may move now. */
  mySeat: number;
  legal: readonly number[];
  /** The number on the die, or null before anything has been rolled. */
  dieValue: number | null;
  /** Show the die tumbling instead of resting (a roll is on its way to the server). */
  rolling: boolean;
  event: SceneEvent | null;
  onDone: () => void;
};

/** The last event, ready to play: who moved, and where each captured pawn flies to (world positions). */
export type SceneEvent = {
  seat: number;
  token: number;
  quad: number;
  ev: Event;
  captured: { seat: number; token: number; from: [number, number]; to: [number, number] }[];
};

export function LudoScene(p: LudoSceneProps) {
  const pawns = useMemo(
    () => layoutPawns(p.tokens, p.quads, p.turns),
    [p.tokens, p.quads, p.turns],
  );
  const refs = useRef(new Map<string, THREE.Group>());
  return (
    <>
      <color attach="background" args={['#131313']} />
      <CameraRig spec={LUDO_CAMERA} />
      <WakeOn deps={[p.tokens, p.legal, p.dieValue, p.rolling, p.event]} />
      <ambientLight intensity={1.3} color="#F4F0FF" />
      <directionalLight position={[4, 12, 8]} intensity={2.1} color="#FFF3DF" />
      <directionalLight position={[-6, 6, -4]} intensity={0.5} color="#9DB8FF" />
      <Board quadColors={p.quadColors} turns={p.turns} />
      {pawns.map((pw) => (
        <PawnMesh
          key={`${pw.seat}-${pw.token}`}
          id={`${pw.seat}-${pw.token}`}
          refs={refs}
          x={pw.x}
          z={pw.z}
          scale={pw.scale}
          color={p.colors[pw.seat] ?? NEUTRAL}
          legal={pw.seat === p.mySeat && p.legal.includes(pw.token)}
        />
      ))}
      <Die
        value={p.dieValue}
        rolling={p.rolling}
        event={p.event}
        refs={refs}
        turns={p.turns}
        onDone={p.onDone}
      />
    </>
  );
}

// ---- the board ---------------------------------------------------------------------------------------

const Board = memo(function Board({
  quadColors,
  turns,
}: {
  quadColors: readonly string[];
  turns: number;
}) {
  const w = (p: P): [number, number] => toWorld(p, turns);
  const lines = useMemo(() => {
    const cells: P[] = [];
    for (let i = 0; i < 52; i++) cells.push(ringCell(i));
    for (let q = 0; q < 4; q++) HOME_COLUMN.forEach((c) => cells.push(rotate(c, q)));
    const pos: number[] = [];
    for (const c of cells) {
      const [x, z] = toWorld(c, turns);
      const x0 = x - 0.5;
      const x1 = x + 0.5;
      const z0 = z - 0.5;
      const z1 = z + 0.5;
      pos.push(
        x0,
        0.07,
        z0,
        x1,
        0.07,
        z0,
        x1,
        0.07,
        z0,
        x1,
        0.07,
        z1,
        x1,
        0.07,
        z1,
        x0,
        0.07,
        z1,
        x0,
        0.07,
        z0,
        x0,
        0.07,
        z1,
      );
    }
    return new Float32Array(pos);
  }, [turns]);

  const tri = useMemo(
    () =>
      [0, 1, 2, 3].map((q) => {
        const pts = (
          [
            [5.5, 5.5],
            [5.5, 8.5],
            [7, 7],
          ] as P[]
        ).map((v) => toWorld(rotate(v, q), turns));
        const shape = new THREE.Shape();
        shape.moveTo(pts[0]![0], -pts[0]![1]);
        shape.lineTo(pts[1]![0], -pts[1]![1]);
        shape.lineTo(pts[2]![0], -pts[2]![1]);
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      }),
    [turns],
  );
  useEffect(() => () => tri.forEach((g) => g.dispose()), [tri]);

  return (
    <group>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[15.8, 0.36, 15.8]} />
        <meshStandardMaterial color="#8A7A62" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[15.5, 0.1, 15.5]} />
        <meshStandardMaterial color="#E6E1D8" roughness={0.7} />
      </mesh>
      {/* the cross of squares */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[15, 3]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, 15]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
      </mesh>
      {/* the four yards */}
      {[0, 1, 2, 3].map((q) => {
        const [x, z] = w(rotate([2.5, 2.5], q));
        const color = quadColors[q] ?? NEUTRAL;
        return (
          <group key={q} position={[x, 0.035, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <planeGeometry args={[6, 6]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0, 0.006]}>
              <planeGeometry args={[4.2, 4.2]} />
              <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
            </mesh>
          </group>
        );
      })}
      {[0, 1, 2, 3].flatMap((q) =>
        [0, 1, 2, 3].map((t) => {
          const [x, z] = w(tokenCell(q, -1, t));
          return (
            <mesh key={`spot-${q}-${t}`} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.62, 24]} />
              <meshStandardMaterial color={quadColors[q] ?? NEUTRAL} roughness={0.7} />
            </mesh>
          );
        }),
      )}
      {/* each colour's start square and home column */}
      {[0, 1, 2, 3].flatMap((q) => {
        const color = quadColors[q] ?? NEUTRAL;
        const cells: P[] = [ringCell(q * 13), ...HOME_COLUMN.map((c) => rotate(c, q))];
        return cells.map((c, i) => {
          const [x, z] = w(c);
          return (
            <mesh key={`tile-${q}-${i}`} position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.96, 0.96]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          );
        });
      })}
      {/* the stars: safe squares */}
      {Array.from({ length: 52 }, (_, i) => i)
        .filter(isStar)
        .map((i) => {
          const [x, z] = w(ringCell(i));
          return (
            <group key={`star-${i}`} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <mesh>
                <circleGeometry args={[0.36, 4]} />
                <meshBasicMaterial color="#9AA0A8" />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <circleGeometry args={[0.36, 4]} />
                <meshBasicMaterial color="#9AA0A8" />
              </mesh>
            </group>
          );
        })}
      {/* the middle: a triangle of each colour */}
      {tri.map((g, q) => (
        <mesh
          key={`tri-${q}`}
          geometry={g}
          position={[0, 0.055, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            color={quadColors[q] ?? NEUTRAL}
            roughness={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      <lineSegments position={[0, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#9C9486" />
      </lineSegments>
    </group>
  );
});

// ---- pawns -------------------------------------------------------------------------------------------

function PawnMesh({
  id,
  refs,
  x,
  z,
  scale,
  color,
  legal,
}: {
  id: string;
  refs: MutableRefObject<Map<string, THREE.Group>>;
  x: number;
  z: number;
  scale: number;
  color: string;
  legal: boolean;
}) {
  return (
    <group
      ref={(g) => {
        if (g) refs.current.set(id, g);
        else refs.current.delete(id);
      }}
      position={[x, PAWN_Y, z]}
      scale={scale}
    >
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.32, 0.36, 0.14, 20]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.37, 24]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <coneGeometry args={[0.26, 0.7, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.2, 18, 14]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {legal ? (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.44, 0.56, 28]} />
          <meshBasicMaterial color="#E3A93B" />
        </mesh>
      ) : null}
    </group>
  );
}

// ---- the die and the clock for the animation ------------------------------------------------------------

function Die({
  value,
  rolling,
  event,
  refs,
  turns,
  onDone,
}: {
  value: number | null;
  rolling: boolean;
  event: SceneEvent | null;
  refs: MutableRefObject<Map<string, THREE.Group>>;
  turns: number;
  onDone: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const meter = useFrameMeter('__ludo');
  const start = useRef(performance.now());
  const doneFor = useRef<SceneEvent | null>(null);
  const rollingSince = useRef(0);
  const frames = useRef(0);

  // A new event begins.
  useEffect(() => {
    if (!event) return;
    start.current = performance.now();
    doneFor.current = null;
    frames.current++;
    invalidate();
  }, [event, invalidate]);

  useEffect(() => {
    if (rolling) {
      rollingSince.current = performance.now();
      invalidate();
    }
  }, [rolling, invalidate]);

  // Rest pose (and again when an event ends).
  const shown = value ?? 1;
  useEffect(() => {
    const g = group.current;
    if (!g || event || rolling) return;
    const r = DIE_REST[shown] ?? [0, 0, 0];
    g.rotation.set(r[0], r[1], r[2]);
    g.position.set(0, 0.62, 0);
    invalidate();
  }, [shown, event, rolling, invalidate]);

  useFrame(() => {
    const g = group.current;
    if (rolling && !event && g) {
      // waiting for the server's roll: a gentle tumble that never lands on anything
      const t = (performance.now() - rollingSince.current) / 1000;
      g.rotation.set(t * 7, t * 5, t * 3);
      g.position.set(0, 0.62 + Math.abs(Math.sin(t * 6)) * 0.35, 0);
      invalidate();
      return;
    }
    if (!event) return;
    const ms = performance.now() - start.current;
    const ev = event.ev;
    if (ev.kind === 'roll') {
      if (g) {
        const d = dieAt(ev.dice, ms);
        g.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
        g.position.set(0, 0.62 + d.lift, 0);
      }
    } else {
      const mover = refs.current.get(`${event.seat}-${event.token}`);
      if (mover) {
        const h = hopAt(event.quad, event.token, ev.last.from, ev.last.to, ms);
        const [x, z] = toWorld(h.cell, turns);
        mover.position.set(x, PAWN_Y + h.lift, z);
      }
      const k = within(ms, ev.hopMs, CAPTURE_FLY_MS);
      if (k > 0) {
        for (const c of event.captured) {
          const pawn = refs.current.get(`${c.seat}-${c.token}`);
          if (!pawn) continue;
          const e = easeOut(k);
          pawn.position.set(
            lerp(c.from[0], c.to[0], e),
            PAWN_Y + 1.4 * 4 * k * (1 - k),
            lerp(c.from[1], c.to[1], e),
          );
        }
      }
    }
    if (ms >= ev.durationMs) {
      if (doneFor.current !== event) {
        doneFor.current = event;
        onDone();
      }
      return;
    }
    meter(frames.current);
    invalidate();
  });

  return (
    <group ref={group} position={[0, 0.62, 0]} scale={1.05}>
      <mesh>
        <boxGeometry args={[0.96, 0.96, 0.96]} />
        <meshStandardMaterial color="#FBF8F3" roughness={0.35} />
      </mesh>
      {DIE_FACES.map((f) => (
        <group key={f.value} rotation={[f.rot[0], f.rot[1], f.rot[2]]}>
          {(PIPS[f.value] ?? []).map((p, i) => (
            <mesh key={i} position={[p[0] * 0.55, p[1] * 0.55, 0.486]}>
              <circleGeometry args={[0.1, 14]} />
              <meshBasicMaterial color="#1B140F" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
