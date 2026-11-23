import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { EIGHT_BALL_POCKETS, sinCosCenti } from '@dyce/games';
import type { CameraSpec } from './r3f-common/camera-math';
import { CameraRig, WakeOn, useFrame, useFrameMeter, useThree } from './r3f-common/scene-kit';
import { Strip } from './r3f-common/Strip';
import { playbackOver, playbackSample, type Playback } from './r3f-common/shot-flow';
import {
  BALL_COLORS,
  BALL_R_M,
  BALL_SLOTS,
  DMM,
  TABLE_L_M,
  TABLE_W_M,
  ballsToSlots,
  pocketWorld,
  sampleShot,
  tableToWorld,
  wrapAngle,
  type AimGuide,
  type Ball,
  type Hand,
  type ShotPlanData,
} from './eight-ball-logic';

/**
 * The 8 Ball table in 3D (React Three Fiber). It only draws: the balls it is given (or, while a shot plays,
 * the frames of the engine's own simulation), the aim guide, the cue and ball-in-hand markers. Metres; the
 * engine's table is converted in one place (`tableToWorld`).
 */

/** From the head end, looking down the table: the player's seat. */
export const EIGHT_BALL_CAMERA: CameraSpec = {
  target: [0, 0, 0.12],
  dir: [0, 0.7, 0.714],
  distance: 3.4,
  fovDeg: 36,
  fitWidth: 1.85,
};

const RAIL = '#6B3A1C';
const RAIL_DARK = '#3B2111';
const FELT = '#13824F';
const CUSHION = '#0C5A38';

export type EightBallSceneProps = {
  /** The table at rest (dmm); used whenever no shot is playing. */
  balls: readonly Ball[];
  playbackRef: MutableRefObject<Playback<ShotPlanData> | null>;
  playToken: number;
  onPlaybackEnd: (token: number) => void;
  hand: Hand;
  /** The aim line, shown while a player is aiming. */
  guide: AimGuide | null;
  /** The cue: its angle (centidegrees) and how far it is drawn back (0..1), or null to hide it. */
  cue: { angle: number; pull: number } | null;
  /** A ring around the cue ball while placing it: green when the spot is legal, red when not. */
  placing: { ok: boolean } | null;
  calledPocket: number | null;
};

export function EightBallScene({
  balls,
  playbackRef,
  playToken,
  onPlaybackEnd,
  hand,
  guide,
  cue,
  placing,
  calledPocket,
}: EightBallSceneProps) {
  return (
    <>
      <color attach="background" args={['#120C08']} />
      <CameraRig spec={EIGHT_BALL_CAMERA} />
      <WakeOn deps={[balls, playToken, hand, guide, cue, placing, calledPocket]} />
      <ambientLight intensity={1.2} color="#FFEBD2" />
      <directionalLight position={[0.6, 3, 1.2]} intensity={2.1} color="#FFF3DF" />
      <pointLight position={[0, 1.4, -0.2]} intensity={1.6} color="#FFE2B0" distance={5} />
      <Room />
      <Table hand={hand} calledPocket={calledPocket} />
      <Balls balls={balls} playbackRef={playbackRef} onEnd={onPlaybackEnd} />
      {guide ? <Guide guide={guide} /> : null}
      {cue ? <Cue balls={balls} cue={cue} /> : null}
      {placing ? <PlaceRing balls={balls} ok={placing.ok} /> : null}
    </>
  );
}

function Room() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, -0.4]}>
      <planeGeometry args={[14, 14]} />
      <meshStandardMaterial color="#0B0806" roughness={1} />
    </mesh>
  );
}

function Table({ hand, calledPocket }: { hand: Hand; calledPocket: number | null }) {
  const W = TABLE_W_M;
  const L = TABLE_L_M;
  const cush = 0.04;
  const rail = 0.11;
  const sideX = W / 2 + cush + rail / 2;
  const endZ = L / 2 + cush + rail / 2;
  const diamonds = useMemo(() => {
    const out: [number, number][] = [];
    for (const s of [-1, 1]) {
      for (const f of [0.125, 0.375, 0.625, 0.875]) {
        if (f === 0.5) continue;
        out.push([s * (W / 2 + cush + rail / 2), (f - 0.5) * L]);
      }
    }
    for (const s of [-1, 1]) {
      for (const f of [0.25, 0.5, 0.75]) out.push([(f - 0.5) * W, s * (L / 2 + cush + rail / 2)]);
    }
    return out;
  }, [W, L]);
  const head = tableToWorld(560, 0)[2];
  return (
    <group>
      {/* the base under the felt, and the felt */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[W + 0.2, 0.1, L + 0.2]} />
        <meshStandardMaterial color={RAIL_DARK} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color={FELT} roughness={0.95} />
      </mesh>
      {/* cushions */}
      {[-1, 1].map((s) => (
        <mesh key={`cl${s}`} position={[s * (W / 2 + cush / 2), 0.015, 0]}>
          <boxGeometry args={[cush, 0.03, L]} />
          <meshStandardMaterial color={CUSHION} roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`ce${s}`} position={[0, 0.015, s * (L / 2 + cush / 2)]}>
          <boxGeometry args={[W + 2 * cush, 0.03, cush]} />
          <meshStandardMaterial color={CUSHION} roughness={0.9} />
        </mesh>
      ))}
      {/* wooden rails */}
      {[-1, 1].map((s) => (
        <mesh key={`rl${s}`} position={[s * sideX, 0.025, 0]}>
          <boxGeometry args={[rail, 0.05, L + 2 * (cush + rail)]} />
          <meshStandardMaterial color={RAIL} roughness={0.55} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`re${s}`} position={[0, 0.025, s * endZ]}>
          <boxGeometry args={[W + 2 * cush, 0.05, rail]} />
          <meshStandardMaterial color={RAIL} roughness={0.55} />
        </mesh>
      ))}
      {diamonds.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.0515, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <planeGeometry args={[0.014, 0.014]} />
          <meshBasicMaterial color="#F3E3C0" />
        </mesh>
      ))}
      {/* pockets */}
      {EIGHT_BALL_POCKETS.map((p, i) => {
        const w = pocketWorld(i);
        const out = Math.hypot(w[0], w[2]) || 1;
        const px = w[0] + (w[0] / out) * 0.012;
        const pz = w[2] + (w[2] / out) * 0.012;
        const r = (p.r / 1000) * 1.05;
        return (
          <group key={i} position={[px, 0.0515, pz]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <circleGeometry args={[r, 24]} />
              <meshBasicMaterial color="#030201" />
            </mesh>
            <mesh>
              <ringGeometry args={[r, r + 0.007, 24]} />
              <meshBasicMaterial color={calledPocket === i ? '#FFD24A' : '#2A1A10'} />
            </mesh>
            {calledPocket === i ? (
              <mesh>
                <ringGeometry args={[r + 0.012, r + 0.03, 24]} />
                <meshBasicMaterial color="#FFD24A" transparent opacity={0.7} />
              </mesh>
            ) : null}
          </group>
        );
      })}
      {/* the head string: where the break is placed behind */}
      {hand === 'kitchen' ? (
        <Strip a={[-W / 2, 0.002, head]} b={[W / 2, 0.002, head]} width={0.004} opacity={0.55} />
      ) : null}
    </group>
  );
}

// ---- balls -------------------------------------------------------------------------------------------

function Balls({
  balls,
  playbackRef,
  onEnd,
}: {
  balls: readonly Ball[];
  playbackRef: MutableRefObject<Playback<ShotPlanData> | null>;
  onEnd: (token: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const tick = useFrameMeter('__eightBall');
  const groups = useRef<(THREE.Group | null)[]>([]);
  const rolls = useRef<(THREE.Group | null)[]>([]);
  const prev = useRef<(THREE.Vector3 | null)[]>(Array.from({ length: BALL_SLOTS }, () => null));
  const rest = useRef(ballsToSlots(balls));
  rest.current = ballsToSlots(balls);

  const geo = useMemo(
    () => ({
      sphere: new THREE.SphereGeometry(BALL_R_M, 24, 16),
      band: new THREE.SphereGeometry(
        BALL_R_M * 1.006,
        24,
        8,
        0,
        Math.PI * 2,
        Math.PI / 3,
        Math.PI / 3,
      ),
      shadow: new THREE.CircleGeometry(BALL_R_M * 1.1, 14),
    }),
    [],
  );
  const mats = useMemo(
    () =>
      BALL_COLORS.map((c, id) =>
        id >= 9
          ? {
              base: new THREE.MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.22 }),
              band: new THREE.MeshStandardMaterial({ color: c, roughness: 0.22 }),
            }
          : {
              base: new THREE.MeshStandardMaterial({ color: c, roughness: 0.22 }),
              band: null,
            },
      ),
    [],
  );
  const shadowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#000800', transparent: true, opacity: 0.35 }),
    [],
  );

  useFrame(() => {
    const pb = playbackRef.current;
    let slots: number[] = rest.current;
    let animating = false;
    if (pb) {
      const now = performance.now();
      slots = playbackSample(pb, now, sampleShot);
      if (playbackOver(pb, now)) {
        if (!pb.done) {
          pb.done = true;
          onEnd(pb.token);
        }
      } else {
        animating = true;
        tick(pb.token);
      }
    }
    for (let id = 0; id < BALL_SLOTS; id++) {
      const g = groups.current[id];
      if (!g) continue;
      const alive = (slots[id * 3 + 2] as number) > 0.5;
      g.visible = alive;
      if (!alive) {
        prev.current[id] = null;
        continue;
      }
      const [x, y, z] = tableToWorld(
        (slots[id * 3] as number) / DMM,
        (slots[id * 3 + 1] as number) / DMM,
        BALL_R_M,
      );
      const before = prev.current[id];
      if (before) {
        const dx = x - before.x;
        const dz = z - before.z;
        const d = Math.hypot(dx, dz);
        const roll = rolls.current[id];
        if (roll && d > 1e-6 && d < 0.2) {
          // Rolling without slipping: turn about the axis across the direction of travel.
          roll.rotateOnWorldAxis(new THREE.Vector3(dz / d, 0, -dx / d), d / BALL_R_M);
        }
        before.set(x, y, z);
      } else prev.current[id] = new THREE.Vector3(x, y, z);
      g.position.set(x, y, z);
    }
    if (animating) invalidate();
  });

  return (
    <group>
      {Array.from({ length: BALL_SLOTS }, (_, id) => (
        <group
          key={id}
          ref={(g) => {
            groups.current[id] = g;
          }}
          visible={false}
        >
          <group
            ref={(g) => {
              rolls.current[id] = g;
            }}
          >
            <mesh geometry={geo.sphere} material={mats[id]?.base} />
            {mats[id]?.band ? <mesh geometry={geo.band} material={mats[id]?.band} /> : null}
          </group>
          <mesh
            geometry={geo.shadow}
            material={shadowMat}
            position={[0.004, -BALL_R_M + 0.0012, 0.004]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </group>
      ))}
    </group>
  );
}

// ---- guide, cue, placement ---------------------------------------------------------------------------

function Guide({ guide }: { guide: AimGuide }) {
  const y = BALL_R_M;
  const a = tableToWorld(guide.from.x, guide.from.y, y);
  const b = tableToWorld(guide.to.x, guide.to.y, y);
  const objEnd =
    guide.objectDir && guide.hitId !== null
      ? tableToWorld(
          guide.to.x + guide.objectDir.x * 2 * BALL_R_M * 1000 + guide.objectDir.x * 260,
          guide.to.y + guide.objectDir.y * 2 * BALL_R_M * 1000 + guide.objectDir.y * 260,
          y,
        )
      : null;
  const objStart = objEnd
    ? tableToWorld(
        guide.to.x + (guide.objectDir?.x ?? 0) * 2 * BALL_R_M * 1000,
        guide.to.y + (guide.objectDir?.y ?? 0) * 2 * BALL_R_M * 1000,
        y,
      )
    : null;
  return (
    <group>
      <Strip a={a} b={b} width={0.005} opacity={0.8} />
      {guide.hitId !== null ? (
        <mesh position={[b[0], y, b[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[BALL_R_M * 0.9, BALL_R_M * 1.05, 28]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} depthTest={false} />
        </mesh>
      ) : null}
      {objStart && objEnd ? <Strip a={objStart} b={objEnd} width={0.005} opacity={0.45} /> : null}
    </group>
  );
}

function Cue({ balls, cue }: { balls: readonly Ball[]; cue: { angle: number; pull: number } }) {
  const ball = balls.find((b) => b.id === 0);
  if (!ball) return null;
  const [s, c] = sinCosCenti(wrapAngle(cue.angle));
  const [x, y, z] = tableToWorld(ball.x / DMM, ball.y / DMM, BALL_R_M * 1.05);
  // The aim direction in the world, and the turn that points the stick's -z along it.
  const dx = -s;
  const dz = -c;
  const gap = BALL_R_M * 1.6 + cue.pull * 0.22;
  const len = 1.25;
  return (
    <group position={[x, y, z]} rotation={[0, Math.atan2(-dx, -dz), 0]}>
      <mesh position={[0, 0, gap + len / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0055, 0.0135, len, 14]} />
        <meshStandardMaterial color="#E9C98F" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, gap + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0057, 0.0057, 0.02, 14]} />
        <meshStandardMaterial color="#2F6BEA" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, gap + len * 0.82]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0112, 0.0135, len * 0.36, 14]} />
        <meshStandardMaterial color="#3B1C0C" roughness={0.6} />
      </mesh>
    </group>
  );
}

function PlaceRing({ balls, ok }: { balls: readonly Ball[]; ok: boolean }) {
  const ball = balls.find((b) => b.id === 0);
  if (!ball) return null;
  const [x, , z] = tableToWorld(ball.x / DMM, ball.y / DMM, 0);
  return (
    <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[BALL_R_M * 1.25, BALL_R_M * 1.6, 28]} />
      <meshBasicMaterial color={ok ? '#38D27F' : '#FF5A3C'} transparent opacity={0.9} />
    </mesh>
  );
}
