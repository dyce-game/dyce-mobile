import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type * as THREE from 'three';
import { CameraRig, WakeOn, useFrame, useThree } from './r3f-common/scene-kit';
import { easeOut, lerp, within } from './board3d/anim';
import {
  SEA_CAMERA,
  SIZE,
  cellWorld,
  shipPose,
  type Ship,
  type ShotCell,
  type ShotResult,
} from './sea-battle-logic';

/**
 * Sea Battle in 3D (React Three Fiber): a 10 x 10 sea seen from a corner, as in the design (turned and tilted,
 * almost isometric). One unit is one cell; cell (r, c) is centred at x = c + 0.5, z = r + 0.5. Ships are a
 * flattened capsule and a deckhouse; a hit is a flame, a miss a ring, a sunk ship lies dark in the water.
 * Frames are drawn only when something changes (frameloop "demand"), so a still board costs nothing; the
 * splash and fire of a shot invalidate frames for about a second while they play.
 */

export const FX_MS = 900;
const STAGGER_MS = 260;

export type Fresh = { token: number; shots: { cell: number; result: ShotResult }[] };

export type SeaBattleSceneProps = {
  /** Shots already on these waters (those in `fresh` are held back until their effect has played). */
  shots: readonly ShotCell[];
  /** Ships drawn afloat: your fleet, or every fleet once the game is over. */
  ships: readonly Ship[];
  /** Ships drawn sunk (always public). */
  sunk: readonly Ship[];
  cursor: number | null;
  cursorTone: 'ok' | 'bad';
  picks: readonly number[];
  ghost: { ship: Ship; ok: boolean } | null;
  fresh: Fresh | null;
  onFreshDone: (token: number) => void;
};

export function SeaBattleScene(p: SeaBattleSceneProps) {
  const hidden = useMemo(() => new Set(p.fresh?.shots.map((s) => s.cell) ?? []), [p.fresh]);
  return (
    <>
      <color attach="background" args={['#0B2447']} />
      <CameraRig spec={SEA_CAMERA} />
      <WakeOn
        deps={[p.shots, p.ships, p.sunk, p.cursor, p.cursorTone, p.picks, p.ghost, p.fresh]}
      />
      <ambientLight intensity={1.15} color="#CFE4FF" />
      <directionalLight position={[8, 14, 6]} intensity={2.2} color="#FFE9CC" />
      <directionalLight position={[-6, 6, -4]} intensity={0.6} color="#7FB2FF" />
      <Sea />
      {p.sunk.map((s) => (
        <Boat key={`sunk-${s.id}`} ship={s} sunk />
      ))}
      {p.ships.map((s) => (
        <Boat key={s.id} ship={s} />
      ))}
      {p.ghost ? <Boat ship={p.ghost.ship} ghost={p.ghost.ok ? 'ok' : 'bad'} /> : null}
      {p.shots.map((s) =>
        hidden.has(s.cell) ? null : <Marker key={s.cell} cell={s.cell} result={s.result} />,
      )}
      {p.picks.map((c) => (
        <PickRing key={`pick-${c}`} cell={c} />
      ))}
      {p.cursor !== null ? <Cursor cell={p.cursor} tone={p.cursorTone} /> : null}
      {p.fresh ? <FreshFx fresh={p.fresh} onDone={p.onFreshDone} /> : null}
    </>
  );
}

// ---- the sea -----------------------------------------------------------------------------------------

const Sea = memo(function Sea() {
  return (
    <group>
      <mesh position={[5, -0.32, 5]}>
        <boxGeometry args={[11.1, 0.3, 11.1]} />
        <meshStandardMaterial color="#1D4A80" roughness={0.6} />
      </mesh>
      <mesh position={[5, -0.27, 5]}>
        <boxGeometry args={[10.7, 0.3, 10.7]} />
        <meshStandardMaterial color="#06182F" roughness={0.8} />
      </mesh>
      <mesh position={[5, -0.07, 5]}>
        <boxGeometry args={[10, 0.12, 10]} />
        <meshStandardMaterial color="#1A5B9A" roughness={0.35} metalness={0.1} />
      </mesh>
      {/* a paler checker so the cells read even without the grid lines */}
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        if ((r + c) % 2 === 0) return null;
        return (
          <mesh key={i} position={[c + 0.5, 0.001, r + 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color="#3C86C6" transparent opacity={0.22} />
          </mesh>
        );
      })}
      <gridHelper args={[10, 10, '#9FD2FF', '#7FB8EE']} position={[5, 0.004, 5]} />
    </group>
  );
});

// ---- ships -------------------------------------------------------------------------------------------

function Boat({ ship, sunk, ghost }: { ship: Ship; sunk?: boolean; ghost?: 'ok' | 'bad' }) {
  const pose = shipPose(ship);
  const span = ship.len * 0.94;
  const hullLen = Math.max(0.1, span - 0.66);
  const color = ghost ? (ghost === 'ok' ? '#5DE0A0' : '#FF6B5A') : sunk ? '#3B2F31' : '#9AA3AE';
  const deck = ghost ? color : sunk ? '#2A2123' : '#C9D0D8';
  const alpha = ghost ? 0.62 : 1;
  return (
    <group
      position={[pose.x, sunk ? -0.16 : 0.02, pose.z]}
      rotation={[sunk ? 0.14 : 0, pose.along === 'z' ? -Math.PI / 2 : 0, sunk ? 0.1 : 0]}
    >
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.62, 1, 1]}>
        <capsuleGeometry args={[0.33, hullLen, 4, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.2}
          transparent={!!ghost}
          opacity={alpha}
        />
      </mesh>
      <mesh position={[ship.len * 0.1, 0.46, 0]}>
        <boxGeometry args={[Math.min(0.9, ship.len * 0.22), 0.26, 0.42]} />
        <meshStandardMaterial color={deck} roughness={0.6} transparent={!!ghost} opacity={alpha} />
      </mesh>
      {ship.len >= 3 ? (
        <mesh position={[ship.len * 0.1, 0.7, 0]}>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial
            color={deck}
            roughness={0.6}
            transparent={!!ghost}
            opacity={alpha}
          />
        </mesh>
      ) : null}
    </group>
  );
}

// ---- markers -----------------------------------------------------------------------------------------

function Marker({ cell, result }: { cell: number; result: ShotResult }) {
  const [x, , z] = cellWorld(cell);
  if (result === 'miss') return <MissRing x={x} z={z} />;
  return <Flame x={x} z={z} big={result === 'hit'} />;
}

function MissRing({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.02, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.05, 6, 20]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.31, 0.46, 20]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function Flame({ x, z, big }: { x: number; z: number; big: boolean }) {
  const s = big ? 1 : 0.75;
  return (
    <group position={[x, 0.1, z]}>
      <mesh position={[0, 0.3 * s, 0]} scale={s}>
        <coneGeometry args={[0.2, 0.62, 10]} />
        <meshStandardMaterial color="#FF5A1F" emissive="#FF4A10" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0.2 * s, 0]} scale={s}>
        <coneGeometry args={[0.12, 0.38, 10]} />
        <meshBasicMaterial color="#FFE08A" />
      </mesh>
      <mesh position={[0.04, 0.8 * s, 0]}>
        <sphereGeometry args={[0.15, 10, 8]} />
        <meshBasicMaterial color="#3A3A3A" transparent opacity={big ? 0.5 : 0.3} />
      </mesh>
    </group>
  );
}

function PickRing({ cell }: { cell: number }) {
  const [x, , z] = cellWorld(cell);
  return (
    <mesh position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.42, 4, 1, Math.PI / 4]} />
      <meshBasicMaterial color="#E3A93B" />
    </mesh>
  );
}

/** The target frame on a cell, with a beam so it can be found from a low angle. */
function Cursor({ cell, tone }: { cell: number; tone: 'ok' | 'bad' }) {
  const [x, , z] = cellWorld(cell);
  const color = tone === 'ok' ? '#FFC94D' : '#FF7A66';
  const edge = (px: number, pz: number, w: number, d: number) => (
    <mesh position={[px, 0.035, pz]}>
      <boxGeometry args={[w, 0.05, d]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.94, 0.94]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>
      {edge(0, -0.47, 0.98, 0.06)}
      {edge(0, 0.47, 0.98, 0.06)}
      {edge(-0.47, 0, 0.06, 0.98)}
      {edge(0.47, 0, 0.06, 0.98)}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 1.8, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ---- the effect of a shot ----------------------------------------------------------------------------

/**
 * A shell falls onto each fresh cell, then a splash ring (a miss) or a fireball (a hit, a sunk ship) blooms.
 * Calls `onDone(token)` when the last one has finished; the markers for these cells appear after that.
 */
function FreshFx({ fresh, onDone }: { fresh: Fresh; onDone: (token: number) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const start = useRef(performance.now());
  const finished = useRef(-1);
  const total = FX_MS + STAGGER_MS * Math.max(0, fresh.shots.length - 1);

  useEffect(() => {
    start.current = performance.now();
    finished.current = -1;
    invalidate();
  }, [fresh.token, invalidate]);

  useFrame(() => {
    const ms = performance.now() - start.current;
    if (ms >= total) {
      if (finished.current !== fresh.token) {
        finished.current = fresh.token;
        onDone(fresh.token);
      }
      return;
    }
    invalidate();
  });

  return (
    <>
      {fresh.shots.map((s, i) => (
        <FxCell key={s.cell} cell={s.cell} result={s.result} delay={i * STAGGER_MS} start={start} />
      ))}
    </>
  );
}

function FxCell({
  cell,
  result,
  delay,
  start,
}: {
  cell: number;
  result: ShotResult;
  delay: number;
  start: MutableRefObject<number>;
}) {
  const [x, , z] = cellWorld(cell);
  const shell = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const miss = result === 'miss';

  useFrame(() => {
    const ms = performance.now() - start.current - delay;
    const fall = within(ms, 0, 300);
    const bloom = within(ms, 300, FX_MS - 300);
    if (shell.current) {
      shell.current.visible = fall > 0 && fall < 1;
      shell.current.position.y = lerp(7, 0.15, fall * fall);
    }
    if (burst.current) {
      burst.current.visible = !miss && bloom > 0 && bloom < 1;
      const k = easeOut(bloom);
      burst.current.scale.setScalar(0.2 + (result === 'sunk' ? 1.5 : 1.0) * k);
      (burst.current.material as THREE.MeshBasicMaterial).opacity = 1 - bloom * bloom;
    }
    if (ring.current) {
      ring.current.visible = miss && bloom > 0 && bloom < 1;
      ring.current.scale.setScalar(0.4 + 1.6 * easeOut(bloom));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - bloom;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={shell} position={[0, 7, 0]} visible={false}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshBasicMaterial color="#FFE9B0" />
      </mesh>
      <mesh ref={burst} position={[0, 0.35, 0]} visible={false}>
        <sphereGeometry args={[0.45, 14, 10]} />
        <meshBasicMaterial color="#FF8A2A" transparent opacity={1} />
      </mesh>
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.3, 0.06, 6, 24]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={1} />
      </mesh>
    </group>
  );
}
