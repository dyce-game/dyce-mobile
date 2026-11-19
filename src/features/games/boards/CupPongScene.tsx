import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { CupPongCup } from '@dyce/games';
import { useFrame, useThree } from './r3f';
import { sampleTrace, type Point } from './cup-pong-logic';

/**
 * The Cup Pong table in 3D (React Three Fiber). It only draws: the cups it is given, the ball while a
 * throw plays, and the aim guide. What the throw does comes from the simulation in @dyce/games.
 *
 * World frame: the engine's, with z flipped so the thrower looks down -z (three.js's forward). Metres.
 * The engine's millimetres and "z away from the thrower" are converted in one place, `world`.
 */

export type Playback = {
  trace: readonly Point[];
  /** performance.now() when it began. */
  startedAt: number;
  endMs: number;
  /** The throw drops into a cup (the ball disappears into it at the end). */
  sunk: boolean;
  /** Smooths a correction: the ball glides from where it was to the new path. */
  blend: { from: Point; startedAt: number; ms: number } | null;
  done: boolean;
  token: number;
};

const world = (p: Point): [number, number, number] => [p[0] / 1000, p[1] / 1000, -p[2] / 1000];

/** Where the ball waits in the thrower's hand (the engine's release point). */
export const BALL_REST: Point = [0, 300, 150];

const CUP_H = 0.12;
const CUP_TOP_R = 0.0475;
const CUP_BOTTOM_R = 0.034;
const TABLE_W = 0.61;
const TABLE_L = 2.44;
const BALL_R = 0.02;

const BOKEH: readonly (readonly [x: number, y: number, r: number, color: string, o: number])[] = [
  [-1.9, 1.5, 0.34, '#FFB347', 0.5],
  [-1.2, 2.3, 0.2, '#FF6B9D', 0.4],
  [-0.4, 1.2, 0.28, '#FFD27A', 0.45],
  [0.9, 2.1, 0.4, '#FF8F6B', 0.4],
  [1.8, 1.0, 0.25, '#FFB347', 0.5],
  [2.3, 2.4, 0.22, '#FFD27A', 0.4],
  [-2.4, 0.5, 0.22, '#9DD6FF', 0.3],
  [0.2, 0.6, 0.18, '#FFD27A', 0.5],
  [1.3, 0.3, 0.3, '#FF6B9D', 0.3],
  [-0.9, 0.2, 0.16, '#FFB347', 0.5],
];

export type SceneProps = {
  /** The cups standing, in millimetres in the thrower's frame. */
  cups: readonly CupPongCup[];
  /** Changes when the table changes (other player's cups): cups jump instead of sliding. */
  snapKey: string;
  playbackRef: MutableRefObject<Playback | null>;
  /** Changes when a new throw starts, so an idle (on-demand) canvas wakes up. */
  playToken: number;
  /** Show the ball waiting to be thrown. */
  ballAtRest: boolean;
  /** Points of the aim guide (mm), drawn as fading dots. */
  guide: readonly Point[];
  onPlaybackEnd: (token: number) => void;
};

export function CupPongScene({
  cups,
  snapKey,
  playbackRef,
  playToken,
  ballAtRest,
  guide,
  onPlaybackEnd,
}: SceneProps) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [invalidate, playToken, ballAtRest, guide]);

  return (
    <>
      <color attach="background" args={['#170C1C']} />
      <CameraRig />
      <ambientLight intensity={1.15} color="#FFE9D2" />
      <directionalLight position={[0.8, 2.2, 1.2]} intensity={2.2} color="#FFF1DD" />
      <pointLight position={[0, 0.9, -2.2]} intensity={1.4} color="#FFB070" distance={4} />
      <Backdrop />
      <Table />
      <Cups cups={cups} snapKey={snapKey} />
      <Ball playbackRef={playbackRef} rest={ballAtRest} onEnd={onPlaybackEnd} />
      <Guide points={guide} />
    </>
  );
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // Behind the thrower, a little above the table, looking down it at the far cups.
    cam.position.set(0, 0.72, 0.78);
    cam.lookAt(0, 0.05, -2.22);
    // A narrow portrait screen needs a taller field of view to keep the cups a good size.
    cam.fov = size.width / Math.max(1, size.height) < 0.7 ? 40 : 34;
    cam.near = 0.05;
    cam.far = 40;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function Backdrop() {
  return (
    <group>
      {/* the room behind the far end of the table */}
      <mesh position={[0, 1.2, -5.5]}>
        <planeGeometry args={[14, 7]} />
        <meshBasicMaterial color="#2A1220" />
      </mesh>
      <mesh position={[0, 0.2, -5.4]}>
        <planeGeometry args={[14, 2.6]} />
        <meshBasicMaterial color="#3A1A14" />
      </mesh>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, -2]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#1A0D0A" roughness={1} />
      </mesh>
      {BOKEH.map(([x, y, r, color, o], i) => (
        <mesh key={i} position={[x, y, -5.2]}>
          <circleGeometry args={[r, 24]} />
          <meshBasicMaterial color={color} transparent opacity={o * 0.8} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Table() {
  const lineZ = -TABLE_L / 2;
  return (
    <group>
      <mesh position={[0, -0.02, lineZ]}>
        <boxGeometry args={[TABLE_W, 0.04, TABLE_L]} />
        <meshStandardMaterial color="#2F6BEA" roughness={0.55} />
      </mesh>
      {/* dark lip under the table top, and the legs' shadow */}
      <mesh position={[0, -0.06, lineZ]}>
        <boxGeometry args={[TABLE_W - 0.04, 0.06, TABLE_L - 0.04]} />
        <meshStandardMaterial color="#0D2A6B" roughness={0.9} />
      </mesh>
      {/* white edge lines and the centre line */}
      {[-0.285, 0.285].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.0008, lineZ]}>
          <planeGeometry args={[0.012, TABLE_L]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.88} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, -TABLE_L * 0.66]}>
        <planeGeometry args={[0.006, TABLE_L * 0.68]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.88} />
      </mesh>
    </group>
  );
}

// ---- cups --------------------------------------------------------------------------------------------

type Slot = { x: number; z: number; s: number };

function Cups({ cups, snapKey }: { cups: readonly CupPongCup[]; snapKey: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const slots = useRef(new Map<number, Slot>());
  const latest = useRef({ cups, snapKey });
  const seenKey = useRef(snapKey);
  latest.current = { cups, snapKey };

  useEffect(() => invalidate(), [invalidate, cups, snapKey]);

  useFrame((_, delta) => {
    const { cups: want, snapKey: key } = latest.current;
    const snap = seenKey.current !== key;
    seenKey.current = key;
    const byId = new Map(want.map((c) => [c.id, c]));
    const glide = 1 - Math.exp(-Math.min(delta, 0.1) * 11);
    const pop = 1 - Math.exp(-Math.min(delta, 0.1) * 16);
    let moving = false;
    for (let id = 0; id < 10; id++) {
      const g = groups.current[id];
      if (!g) continue;
      const target = byId.get(id);
      let slot = slots.current.get(id);
      if (!slot) {
        slot = {
          x: (target?.x ?? 0) / 1000,
          z: (target?.z ?? 0) / 1000,
          s: target ? 1 : 0,
        };
        slots.current.set(id, slot);
      }
      if (target) {
        const tx = target.x / 1000;
        const tz = target.z / 1000;
        if (snap || slot.s < 0.02) {
          slot.x = tx;
          slot.z = tz;
        } else {
          slot.x += (tx - slot.x) * glide;
          slot.z += (tz - slot.z) * glide;
          if (Math.abs(tx - slot.x) > 0.0005 || Math.abs(tz - slot.z) > 0.0005) moving = true;
        }
      }
      const ts = target ? 1 : 0;
      if (snap) slot.s = ts;
      else slot.s += (ts - slot.s) * pop;
      if (Math.abs(ts - slot.s) > 0.01) moving = true;
      else slot.s = ts;
      g.visible = slot.s > 0.01;
      g.position.set(slot.x, 0, -slot.z);
      g.scale.setScalar(Math.max(slot.s, 0.0001));
    }
    if (moving) invalidate();
  });

  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({
        color: '#D8262C',
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
      inside: new THREE.MeshStandardMaterial({ color: '#5A0A0E', roughness: 0.8 }),
      rim: new THREE.MeshStandardMaterial({ color: '#F4F1EC', roughness: 0.35 }),
      band: new THREE.MeshStandardMaterial({ color: '#8E1218', roughness: 0.5 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#000014', transparent: true, opacity: 0.32 }),
    }),
    [],
  );

  return (
    <group>
      {Array.from({ length: 10 }, (_, id) => (
        <group
          key={id}
          ref={(g) => {
            groups.current[id] = g;
          }}
          visible={false}
        >
          <mesh position={[0, CUP_H / 2, 0]} material={mats.body}>
            <cylinderGeometry args={[CUP_TOP_R, CUP_BOTTOM_R, CUP_H, 28, 1, true]} />
          </mesh>
          <mesh position={[0, CUP_H * 0.34, 0]} material={mats.band}>
            <cylinderGeometry args={[0.0425, 0.0385, 0.012, 28, 1, true]} />
          </mesh>
          <mesh
            position={[0, CUP_H - 0.012, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={mats.inside}
          >
            <circleGeometry args={[CUP_TOP_R - 0.004, 28]} />
          </mesh>
          <mesh position={[0, CUP_H, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.rim}>
            <torusGeometry args={[CUP_TOP_R, 0.0032, 8, 28]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0012, 0]} material={mats.shadow}>
            <circleGeometry args={[0.062, 20]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---- ball --------------------------------------------------------------------------------------------

function Ball({
  playbackRef,
  rest,
  onEnd,
}: {
  playbackRef: MutableRefObject<Playback | null>;
  rest: boolean;
  onEnd: (token: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const mesh = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const meter = useRef({ token: -1, last: 0, frames: 0, worstMs: 0 });

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const pb = playbackRef.current;
    if (!pb) {
      m.visible = rest;
      const [x, y, z] = world(BALL_REST);
      m.position.set(x, y, z);
      if (shadow.current) shadow.current.visible = false;
      return;
    }
    const now = performance.now();
    const t = now - pb.startedAt;
    if (__DEV__) recordFrame(meter.current, pb, now, gl);
    let p = sampleTrace(pb.trace, t);
    if (pb.blend) {
      const k = (now - pb.blend.startedAt) / pb.blend.ms;
      if (k < 1) {
        const from = pb.blend.from;
        p = [
          from[0] + (p[0] - from[0]) * k,
          from[1] + (p[1] - from[1]) * k,
          from[2] + (p[2] - from[2]) * k,
        ];
      } else pb.blend = null;
    }
    const over = t >= pb.endMs && !pb.blend;
    const [x, y, z] = world(p);
    m.position.set(x, y, z);
    m.visible = !(over && pb.sunk) && y > -0.6;
    if (shadow.current) {
      shadow.current.visible = m.visible && y > 0.02 && z < 0 && z > -TABLE_L;
      shadow.current.position.set(x, 0.002, z);
      const s = Math.max(0.4, 1 - y * 1.2);
      shadow.current.scale.set(s, s, s);
    }
    if (over) {
      if (!pb.done) {
        pb.done = true;
        onEnd(pb.token);
      }
    } else invalidate();
  });

  return (
    <>
      <mesh ref={mesh} position={[0, 0.3, -0.15]}>
        <sphereGeometry args={[BALL_R * 1.15, 20, 16]} />
        <meshStandardMaterial color="#F6F3EC" roughness={0.3} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[0.022, 14]} />
        <meshBasicMaterial color="#000014" transparent opacity={0.35} />
      </mesh>
    </>
  );
}

/**
 * Dev only: frame times while a throw plays, left on `globalThis.__cupPong` for the frame-rate check
 * (average and worst frame, draw calls and triangles). Nothing is shipped or sent anywhere.
 */
function recordFrame(
  m: { token: number; last: number; frames: number; worstMs: number },
  pb: Playback,
  now: number,
  gl: THREE.WebGLRenderer,
) {
  if (m.token !== pb.token) {
    m.token = pb.token;
    m.last = 0;
    m.frames = 0;
    m.worstMs = 0;
  }
  if (m.last) m.worstMs = Math.max(m.worstMs, now - m.last);
  m.last = now;
  m.frames++;
  const elapsed = Math.max(1, now - pb.startedAt);
  (globalThis as { __cupPong?: unknown }).__cupPong = {
    token: pb.token,
    frames: m.frames,
    elapsedMs: Math.round(elapsed),
    avgFps: Math.round((m.frames / elapsed) * 1000),
    worstFrameMs: Math.round(m.worstMs),
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
  };
}

// ---- aim guide ---------------------------------------------------------------------------------------

function Guide({ points }: { points: readonly Point[] }) {
  return (
    <group>
      {points.map((p, i) => {
        const t = points.length > 1 ? i / (points.length - 1) : 0;
        const [x, y, z] = world(p);
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.011 - 0.006 * t, 8, 6]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85 - 0.55 * t} />
          </mesh>
        );
      })}
    </group>
  );
}
