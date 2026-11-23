import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { CameraRig, WakeOn, useFrame, useFrameMeter, useThree } from './r3f-common/scene-kit';
import { playbackOver, playbackSample, type Playback } from './r3f-common/shot-flow';
import {
  ARCHERY_CAMERA,
  DISTANCE_M,
  EYE_H,
  arrowDirection,
  faceToWorld,
  sampleArrow,
  type ArrowPlanData,
  type ArrowRecord,
} from './archery-logic';

/**
 * The archery range in 3D (React Three Fiber), seen through a long lens from the shooting line: the target
 * face at 30 m, the arrows already in it, the wind flag, the sight pin, and the arrow in flight from the
 * engine's own landing point and flight time. Metres, the archer at the origin looking down -z.
 */

export type ArcherySceneProps = {
  /** Arrows standing in the face. */
  arrows: readonly ArrowRecord[];
  /** Which player's colour each arrow gets. */
  mineId: string;
  playbackRef: MutableRefObject<Playback<ArrowPlanData> | null>;
  playToken: number;
  onPlaybackEnd: (token: number) => void;
  /** The sight pin (mm on the face), or null. */
  sight: { x: number; y: number } | null;
  /** The wind of this end, 0.1 m/s. */
  windDms: number;
};

const MINE = '#F2C230';
const THEIRS = '#E0453A';

export function ArcheryScene({
  arrows,
  mineId,
  playbackRef,
  playToken,
  onPlaybackEnd,
  sight,
  windDms,
}: ArcherySceneProps) {
  return (
    <>
      <color attach="background" args={['#9ED0EE']} />
      <CameraRig spec={ARCHERY_CAMERA} />
      <WakeOn deps={[arrows, playToken, sight, windDms]} />
      <ambientLight intensity={1.7} color="#FFFFFF" />
      <directionalLight position={[-6, 12, 8]} intensity={2.2} color="#FFF4DD" />
      <Landscape />
      <Target />
      <Flag windDms={windDms} />
      {arrows.map((a, i) => (
        <StuckArrow key={a.seq} rec={a} index={i} color={a.by === mineId ? MINE : THEIRS} />
      ))}
      <FlyingArrow playbackRef={playbackRef} onEnd={onPlaybackEnd} color={MINE} />
      {sight ? <Sight at={faceToWorld(sight.x, sight.y, 0.08)} /> : null}
    </>
  );
}

// ---- the field --------------------------------------------------------------------------------------

function Landscape() {
  return (
    <group>
      <mesh position={[0, 20, -90]}>
        <planeGeometry args={[400, 80]} />
        <meshBasicMaterial color="#9ED0EE" />
      </mesh>
      <mesh position={[0, 1.5, -89]}>
        <planeGeometry args={[400, 7]} />
        <meshBasicMaterial color="#E8F4FA" />
      </mesh>
      {/* the tree line at the back: low, so the sky shows above it */}
      {Array.from({ length: 30 }, (_, i) => (
        <mesh key={i} position={[(i - 14.5) * 5, 0.6 + (i % 3) * 0.5, -70 - (i % 2) * 3]}>
          <sphereGeometry args={[1.9 + (i % 4) * 0.5, 12, 8]} />
          <meshStandardMaterial color={i % 2 ? '#1E4A2A' : '#27602F'} roughness={1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]}>
        <planeGeometry args={[400, 160]} />
        <meshStandardMaterial color="#3E7A2E" roughness={1} />
      </mesh>
      {/* mowing stripes down the range */}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(i - 4.5) * 6, 0.002, -35]}>
          <planeGeometry args={[3, 150]} />
          <meshStandardMaterial color="#4A8A36" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Ring colours from the outside in, with the radius (m) each ends at. */
const RINGS: readonly (readonly [r: number, fill: string])[] = [
  [0.4, '#F6F2EA'],
  [0.32, '#1B140F'],
  [0.24, '#2F6BEA'],
  [0.16, '#E0453A'],
  [0.08, '#F2C230'],
];

function Target() {
  const z = -DISTANCE_M;
  return (
    <group>
      {/* the stand and the boss behind the face */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.32, 0.55, z - 0.4]} rotation={[0.18, 0, s * -0.1]}>
          <cylinderGeometry args={[0.025, 0.03, 1.4, 8]} />
          <meshStandardMaterial color="#6B3E1C" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, EYE_H, z - 0.14]}>
        <boxGeometry args={[1.05, 1.05, 0.22]} />
        <meshStandardMaterial color="#D9B96A" roughness={1} />
      </mesh>
      {RINGS.map(([r, fill], i) => (
        <mesh key={fill} position={[0, EYE_H, z + 0.001 * (i + 1)]}>
          <circleGeometry args={[r, 56]} />
          <meshStandardMaterial color={fill} roughness={0.8} />
        </mesh>
      ))}
      {/* the ten scoring lines and the X */}
      {Array.from({ length: 10 }, (_, i) => {
        const r = 0.04 * (i + 1);
        // The blue and black bands are dark: their lines are white, the others dark.
        const onDark = i >= 4 && i <= 7;
        return (
          <mesh key={i} position={[0, EYE_H, z + 0.007]}>
            <ringGeometry args={[r - 0.0007, r + 0.0007, 56]} />
            <meshBasicMaterial color={onDark ? '#FFFFFF' : '#2A1A10'} transparent opacity={0.6} />
          </mesh>
        );
      })}
      <mesh position={[0, EYE_H, z + 0.008]}>
        <ringGeometry args={[0.0195, 0.0215, 24]} />
        <meshBasicMaterial color="#2A1A10" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** The wind flag beside the target: it streams downwind and lifts as the wind rises. */
function Flag({ windDms }: { windDms: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const cloth = useRef<THREE.Group>(null);
  const strength = Math.min(1, Math.abs(windDms) / 60);
  const dir = windDms >= 0 ? 1 : -1;
  useFrame(() => {
    const c = cloth.current;
    if (!c) return;
    // Hangs at rest, lifts towards horizontal as the wind rises, with a small flutter.
    const lift = strength * 1.25;
    c.rotation.z = dir * (-(Math.PI / 2 - 0.15) + lift);
    c.scale.x = dir;
  });
  useEffect(() => invalidate(), [invalidate, windDms]);
  const z = -DISTANCE_M + 0.6;
  return (
    <group position={[0.95, 0, z]}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.012, 0.015, 2.4, 8]} />
        <meshStandardMaterial color="#DDDDDD" roughness={0.6} />
      </mesh>
      <group ref={cloth} position={[0, 2.3, 0]}>
        <mesh position={[0.22, 0, 0]}>
          <planeGeometry args={[0.44, 0.24]} />
          <meshStandardMaterial color="#E3A93B" side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// ---- arrows -------------------------------------------------------------------------------------------

function ArrowModel({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0.012]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.005, 0.03, 8]} />
        <meshStandardMaterial color="#C9CED6" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.76, 8]} />
        <meshStandardMaterial color="#6B3E1C" roughness={0.7} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0, 0.66]} rotation={[0, 0, (i * Math.PI) / 3]}>
          <planeGeometry args={[0.07, 0.16]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** An arrow standing in the face where the server says it landed, splayed a little so they can be told apart. */
function StuckArrow({ rec, index, color }: { rec: ArrowRecord; index: number; color: string }) {
  const [x, y, z] = faceToWorld(rec.x, rec.y);
  const tilt = useMemo(() => {
    const a = ((index * 2.399) % (2 * Math.PI)) as number;
    const d = new THREE.Vector3(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -1).normalize();
    // The tail points back at the archer, so the group's -z (the tip) follows the flight direction.
    return d;
  }, [index]);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(x, y, z);
    g.lookAt(x - tilt.x, y - tilt.y, z - tilt.z);
  }, [x, y, z, tilt]);
  return (
    <group ref={group}>
      <ArrowModel color={color} />
    </group>
  );
}

function FlyingArrow({
  playbackRef,
  onEnd,
  color,
}: {
  playbackRef: MutableRefObject<Playback<ArrowPlanData> | null>;
  onEnd: (token: number) => void;
  color: string;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const tick = useFrameMeter('__archery');
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
    const ms = now - pb.startedAt;
    const p = playbackSample(pb, now, sampleArrow);
    const d = arrowDirection(pb.plan, Math.min(ms, pb.plan.durationMs - 20));
    g.visible = true;
    g.position.set(p[0] as number, p[1] as number, p[2] as number);
    g.lookAt((p[0] as number) - d[0], (p[1] as number) - d[1], (p[2] as number) - d[2]);
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
      <ArrowModel color={color} />
    </group>
  );
}

// ---- the sight pin -----------------------------------------------------------------------------------

function Sight({ at }: { at: readonly [number, number, number] }) {
  const r = 0.045;
  return (
    <group position={[at[0], at[1], at[2]]} renderOrder={10}>
      <mesh>
        <ringGeometry args={[r, r + 0.007, 40]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[r + 0.007, r + 0.011, 40]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} depthTest={false} />
      </mesh>
      {[0, Math.PI / 2].map((a) => (
        <mesh key={a} rotation={[0, 0, a]}>
          <planeGeometry args={[r * 2.8, 0.004]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthTest={false} />
        </mesh>
      ))}
      <mesh>
        <circleGeometry args={[0.006, 12]} />
        <meshBasicMaterial color="#E0453A" depthTest={false} />
      </mesh>
    </group>
  );
}
