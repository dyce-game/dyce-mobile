import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { BASKETBALL_RACKS } from '@dyce/games';
import {
  CameraRig,
  GuideDots,
  WakeOn,
  useFrame,
  useFrameMeter,
  useThree,
} from './r3f-common/scene-kit';
import { playbackOver, playbackSample, type Playback } from './r3f-common/shot-flow';
import type { V3 } from './r3f-common/camera-math';
import {
  BALL_R,
  BOARD_Z,
  RIM_H,
  RIM_R,
  basketballCamera,
  courtToWorld,
  restWorld,
  sampleShot,
  throughAt,
  type ShotPlanData,
} from './basketball-logic';

/**
 * The basketball court in 3D (React Three Fiber): a hoop and backboard seen from the shooter's spot, the five
 * rack spots round the arc, the ball in the hand, the aim guide, and the ball in flight from the engine's own
 * simulation (millimetres in the floor plan; the conversion to the world is `courtToWorld`).
 */

export type BasketballSceneProps = {
  /** The rack being shot from while no shot plays (0-based). */
  rack: number;
  money: boolean;
  playbackRef: MutableRefObject<Playback<ShotPlanData> | null>;
  playToken: number;
  onPlaybackEnd: (token: number) => void;
  /** Show the ball waiting in the hand. */
  ballAtRest: boolean;
  guide: readonly V3[];
};

export function BasketballScene({
  rack,
  money,
  playbackRef,
  playToken,
  onPlaybackEnd,
  ballAtRest,
  guide,
}: BasketballSceneProps) {
  // While a shot plays, the camera and the markers stay at the rack that shot belongs to.
  const shownRack = playbackRef.current?.plan.data.rack ?? rack;
  const spec = useMemo(() => basketballCamera(shownRack), [shownRack]);
  return (
    <>
      <color attach="background" args={['#0E1424']} />
      <CameraRig spec={spec} />
      <WakeOn deps={[rack, playToken, ballAtRest, guide, shownRack]} />
      <ambientLight intensity={1.25} color="#E9EEFF" />
      <directionalLight position={[2, 9, 6]} intensity={2.1} color="#FFF3DF" />
      <pointLight position={[0, 5, -1.5]} intensity={1.8} color="#FFE2B0" distance={14} />
      <Gym />
      <Floor money={money} rack={shownRack} />
      <Hoop playbackRef={playbackRef} />
      <Ball rack={shownRack} playbackRef={playbackRef} rest={ballAtRest} onEnd={onPlaybackEnd} />
      <GuideDots points={guide} radius={0.04} />
    </>
  );
}

// ---- the room ---------------------------------------------------------------------------------------

const LIGHTS: readonly (readonly [x: number, y: number, r: number, c: string, o: number])[] = [
  [-7, 7.5, 0.7, '#FFE2B0', 0.5],
  [-3, 8.2, 0.5, '#FFE2B0', 0.4],
  [2, 8.0, 0.8, '#FFD27A', 0.5],
  [6.5, 7.3, 0.6, '#FFE2B0', 0.45],
  [-9, 5, 0.4, '#9DD6FF', 0.3],
  [9, 5.5, 0.45, '#FF8F6B', 0.3],
  [0, 6.2, 0.35, '#FFE2B0', 0.35],
];

function Gym() {
  return (
    <group>
      <mesh position={[0, 6, -7]}>
        <planeGeometry args={[40, 16]} />
        <meshBasicMaterial color="#1C2440" />
      </mesh>
      <mesh position={[0, 0.9, -6.98]}>
        <planeGeometry args={[40, 1.8]} />
        <meshBasicMaterial color="#0B0F1C" />
      </mesh>
      {LIGHTS.map(([x, y, r, c, o], i) => (
        <mesh key={i} position={[x, y, -6.9]}>
          <circleGeometry args={[r, 20]} />
          <meshBasicMaterial color={c} transparent opacity={o} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function plankFloor(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const x0 = -12;
  const x1 = 12;
  const z0 = -7;
  const z1 = 15;
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n;
    const b = x0 + ((x1 - x0) * (i + 1)) / n;
    pos.push(a, 0, z0, a, 0, z1, b, 0, z1, a, 0, z0, b, 0, z1, b, 0, z0);
    c.set(i % 2 === 0 ? '#C98A4E' : '#D49658');
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function Floor({ money, rack }: { money: boolean; rack: number }) {
  const geo = useMemo(plankFloor, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const keyW = 4.9;
  const keyFrom = courtToWorld(0, 0, 1600)[2]; // baseline, behind the hoop
  const ftLine = courtToWorld(0, 0, -4200)[2];
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={0.55} />
      </mesh>
      {/* the paint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, (keyFrom + ftLine) / 2]}>
        <planeGeometry args={[keyW, ftLine - keyFrom]} />
        <meshBasicMaterial color="#C93E1C" transparent opacity={0.5} />
      </mesh>
      {/* the three-point arc, on the shooters' side */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[6.71, 6.79, 96, 1, Math.PI, Math.PI]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, ftLine]}>
        <planeGeometry args={[keyW, 0.08]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
      </mesh>
      {/* where the five racks are */}
      {BASKETBALL_RACKS.map((r, i) => {
        const p = courtToWorld(r.x, 0, r.z);
        const on = i === rack;
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p[0], 0.006, p[2]]}>
            <ringGeometry args={[0.3, on ? 0.46 : 0.36, 28]} />
            <meshBasicMaterial
              color={on ? (money ? '#FFD24A' : '#E3A93B') : '#FFFFFF'}
              transparent
              opacity={on ? 0.95 : 0.35}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---- hoop ---------------------------------------------------------------------------------------------

function Hoop({ playbackRef }: { playbackRef: MutableRefObject<Playback<ShotPlanData> | null> }) {
  const invalidate = useThree((s) => s.invalidate);
  const net = useRef<THREE.Mesh>(null);
  const boardZ = -BOARD_Z - 0.02;
  // The net swings for half a second after a ball goes through.
  useFrame(() => {
    const m = net.current;
    if (!m) return;
    const pb = playbackRef.current;
    let k = 0;
    if (pb && pb.plan.data.made) {
      const t = performance.now() - pb.startedAt - throughAt(pb.plan);
      if (t > 0 && t < 600) {
        k = Math.sin((t / 600) * Math.PI * 3) * (1 - t / 600);
        invalidate();
      }
    }
    m.scale.set(1 + 0.12 * k, 1 - 0.1 * k, 1 + 0.12 * k);
  });
  return (
    <group>
      {/* the stanchion and the arm */}
      <mesh position={[0, 1.9, boardZ - 0.7]}>
        <cylinderGeometry args={[0.07, 0.09, 3.8, 12]} />
        <meshStandardMaterial color="#59606E" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.2, boardZ - 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.75, 10]} />
        <meshStandardMaterial color="#59606E" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* the backboard: glass, a white frame, the shooter's square */}
      <mesh position={[0, 3.435, boardZ]}>
        <boxGeometry args={[1.8, 1.07, 0.04]} />
        <meshStandardMaterial color="#DCEBFF" transparent opacity={0.72} roughness={0.15} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`v${s}`} position={[s * 0.9, 3.435, boardZ + 0.022]}>
          <boxGeometry args={[0.04, 1.11, 0.02]} />
          <meshBasicMaterial color="#F6F2EA" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`h${s}`} position={[0, 3.435 + s * 0.535, boardZ + 0.022]}>
          <boxGeometry args={[1.84, 0.04, 0.02]} />
          <meshBasicMaterial color="#F6F2EA" />
        </mesh>
      ))}
      <mesh position={[0, 3.248 + 0.225, boardZ + 0.024]}>
        <boxGeometry args={[0.59, 0.03, 0.01]} />
        <meshBasicMaterial color="#C93E1C" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`q${s}`} position={[s * 0.295, 3.248 + 0.11, boardZ + 0.024]}>
          <boxGeometry args={[0.03, 0.25, 0.01]} />
          <meshBasicMaterial color="#C93E1C" />
        </mesh>
      ))}
      {/* the rim and its net */}
      <mesh position={[0, RIM_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_R + 0.009, 0.009, 8, 40]} />
        <meshStandardMaterial color="#E8701E" roughness={0.4} />
      </mesh>
      <mesh position={[0, RIM_H, -(RIM_R + 0.1)]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.07, 0.03, 0.16]} />
        <meshStandardMaterial color="#E8701E" roughness={0.4} />
      </mesh>
      <mesh ref={net} position={[0, RIM_H - 0.2, 0]}>
        <cylinderGeometry args={[RIM_R, 0.13, 0.4, 14, 4, true]} />
        <meshBasicMaterial color="#FFFFFF" wireframe transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// ---- ball -----------------------------------------------------------------------------------------

function Ball({
  rack,
  playbackRef,
  rest,
  onEnd,
}: {
  rack: number;
  playbackRef: MutableRefObject<Playback<ShotPlanData> | null>;
  rest: boolean;
  onEnd: (token: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const tick = useFrameMeter('__basketball');
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const spin = useRef(0);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const pb = playbackRef.current;
    if (!pb) {
      g.visible = rest;
      const r = restWorld(rack);
      g.position.set(r[0], r[1], r[2]);
      g.rotation.set(0.2, 0, 0);
      if (shadow.current) shadow.current.visible = false;
      return;
    }
    const now = performance.now();
    const p = playbackSample(pb, now, sampleShot);
    const [x, y, z] = courtToWorld(p[0] as number, p[1] as number, p[2] as number);
    g.position.set(x, y, z);
    spin.current += Math.min(delta, 0.1) * 7;
    g.rotation.set(spin.current, 0, 0.3);
    const over = playbackOver(pb, now);
    // Gone once it has dropped out of the net, or after it has landed on the floor.
    g.visible = !(over && pb.plan.data.made) && y > 0.05 && y < 12;
    if (shadow.current) {
      shadow.current.visible = g.visible && y > BALL_R * 1.1;
      shadow.current.position.set(x, 0.008, z);
      const s = Math.max(0.35, 1 - y * 0.12);
      shadow.current.scale.set(s, s, s);
    }
    if (over) {
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
    <>
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[BALL_R, 28, 20]} />
          <meshStandardMaterial color="#E8701E" roughness={0.75} />
        </mesh>
        {[0, Math.PI / 2].map((r, i) => (
          <mesh key={i} rotation={[0, r, 0]}>
            <torusGeometry args={[BALL_R * 1.003, 0.0028, 6, 40]} />
            <meshBasicMaterial color="#2A1408" />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BALL_R * 1.003, 0.0028, 6, 40]} />
          <meshBasicMaterial color="#2A1408" />
        </mesh>
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[0.13, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </>
  );
}
