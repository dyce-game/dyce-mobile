import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CameraRig, WakeOn, useFrame, useFrameMeter, useThree } from './r3f-common/scene-kit';
import {
  BOARD_D,
  PIT_R,
  ayoCamera,
  boardWidth,
  layoutSeeds,
  pitXZ,
  stateAt,
  storeX,
  type Display,
  type Timeline,
  type Variant,
} from './ayo-logic';

/**
 * The Ayo / Mancala board in 3D (React Three Fiber): a carved wooden board with twelve pits (and, for
 * Mancala, a store at each end), seen from your seat. One unit is one pit. Every seed is one instance of a
 * single instanced mesh, so the whole board costs a few draw calls however many seeds there are. A sowing
 * plays from a pure timeline (`buildSowTimeline`): the scene asks it for the board at the current time and
 * redraws the seeds, calling `onStep` when the picture moves to the next stage so the counts under the pits
 * can follow, and `onDone` at the end.
 */

const CAP = 96;
const AYO_TONES = ['#D8C3A0', '#C9B48E', '#B89A6C', '#E2D2B4'];
const KALAH_TONES = ['#4BC8F0', '#F0568A', '#F5C14A', '#4FCB86'];

export type AyoSceneProps = {
  variant: Variant;
  seat: 0 | 1;
  /** The board to show while no sowing plays. */
  display: Display;
  /** Your pits that may be lifted now (shows a brass ring on each). */
  legal: readonly number[];
  selected: number | null;
  /** What the selected pit would do: the pit the last seed lands in, the pit it would capture. */
  preview: { land: number | null; capture: number | null } | null;
  replay: { token: number; timeline: Timeline } | null;
  onStep: (d: Display) => void;
  onDone: (token: number) => void;
};

export function AyoScene(p: AyoSceneProps) {
  const spec = useMemo(() => ayoCamera(p.variant), [p.variant]);
  const tones = useMemo(
    () => (p.variant === 'kalah' ? KALAH_TONES : AYO_TONES).map((c) => new THREE.Color(c)),
    [p.variant],
  );
  return (
    <>
      <color attach="background" args={['#1A0F08']} />
      <CameraRig spec={spec} />
      <WakeOn deps={[p.display, p.legal, p.selected, p.preview, p.replay, p.variant]} />
      <ambientLight intensity={1.35} color="#FFEBD0" />
      <directionalLight position={[2, 9, 6]} intensity={2.4} color="#FFE2B8" />
      <pointLight position={[0, 4, 1]} intensity={1.6} color="#FFC983" distance={12} />
      <Wood variant={p.variant} />
      <Rings legal={p.legal} selected={p.selected} preview={p.preview} seat={p.seat} />
      <Seeds
        variant={p.variant}
        seat={p.seat}
        display={p.display}
        tones={tones}
        replay={p.replay}
        onStep={p.onStep}
        onDone={p.onDone}
      />
    </>
  );
}

// ---- the board ---------------------------------------------------------------------------------------

/** The carved top: a plate with a hole for every pit (and a long hole for each Mancala store). */
const Wood = memo(function Wood({ variant }: { variant: Variant }) {
  const W = boardWidth(variant);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const r = 0.5;
    const hw = W / 2;
    const hd = BOARD_D / 2;
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hd - r);
    shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw + r, hd);
    shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hd + r);
    shape.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
    for (let pit = 0; pit < 12; pit++) {
      const [x, z] = pitXZ(pit, 0);
      const hole = new THREE.Path();
      hole.absarc(x, -z, PIT_R, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    if (variant === 'kalah') {
      for (const sx of [-1, 1]) {
        const cx = sx * storeX('kalah');
        const hole = new THREE.Path();
        const half = 0.95;
        hole.moveTo(cx - 0.42, -half);
        hole.absarc(cx, -half, 0.42, Math.PI, 0, false);
        hole.lineTo(cx + 0.42, half);
        hole.absarc(cx, half, 0.42, 0, Math.PI, false);
        hole.lineTo(cx - 0.42, -half);
        shape.holes.push(hole);
      }
    }
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.34,
      bevelEnabled: false,
      curveSegments: 20,
    });
  }, [W, variant]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      {/* the carved plate (extruded along +z, so turned to lie flat with its top at y = 0) */}
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
        <meshStandardMaterial color="#A86F3E" roughness={0.7} />
      </mesh>
      {/* the body under it, and the table */}
      <mesh position={[0, -0.52, 0]}>
        <boxGeometry args={[W + 0.2, 0.36, BOARD_D + 0.2]} />
        <meshStandardMaterial color="#4A2812" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.72, 0.05]}>
        <boxGeometry args={[W + 0.6, 0.1, BOARD_D + 0.7]} />
        <meshStandardMaterial color="#2A1608" roughness={0.9} />
      </mesh>
      {/* the bowls */}
      {Array.from({ length: 12 }, (_, pit) => {
        const [x, z] = pitXZ(pit, 0);
        return (
          <group key={pit} position={[x, 0, z]}>
            <mesh scale={[1, 0.6, 1]}>
              <sphereGeometry args={[PIT_R, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
              <meshStandardMaterial color="#4A2A12" roughness={0.95} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
              <ringGeometry args={[PIT_R - 0.005, PIT_R + 0.045, 32]} />
              <meshStandardMaterial color="#D9A066" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
      {variant === 'kalah'
        ? [-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * storeX('kalah'), -0.19, 0]} scale={[1, 1, 1]}>
              <boxGeometry args={[0.84, 0.3, 2.7]} />
              <meshStandardMaterial color="#3A2010" roughness={0.95} />
            </mesh>
          ))
        : null}
    </group>
  );
});

/** Brass rings on the pits you may lift, a thicker one on the chosen pit, white and red ones for the preview. */
function Rings({
  legal,
  selected,
  preview,
  seat,
}: {
  legal: readonly number[];
  selected: number | null;
  preview: AyoSceneProps['preview'];
  seat: 0 | 1;
}) {
  const ring = (pit: number, color: string, tube: number, grow: number, key: string) => {
    const [x, z] = pitXZ(pit, seat);
    return (
      <mesh key={key} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[PIT_R + grow, tube, 8, 36]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  };
  return (
    <group>
      {legal.map((pit) => (pit === selected ? null : ring(pit, '#E3A93B', 0.022, 0.09, `l${pit}`)))}
      {selected !== null ? ring(selected, '#FFD27A', 0.055, 0.1, 'sel') : null}
      {preview?.land != null ? ring(preview.land, '#FFFFFF', 0.04, 0.1, 'land') : null}
      {preview?.capture != null ? ring(preview.capture, '#FF5A3C', 0.05, 0.1, 'cap') : null}
    </group>
  );
}

// ---- the seeds ---------------------------------------------------------------------------------------

function Seeds({
  variant,
  seat,
  display,
  tones,
  replay,
  onStep,
  onDone,
}: {
  variant: Variant;
  seat: 0 | 1;
  display: Display;
  tones: THREE.Color[];
  replay: AyoSceneProps['replay'];
  onStep: (d: Display) => void;
  onDone: (token: number) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const invalidate = useThree((s) => s.invalidate);
  const meter = useFrameMeter('__ayo');
  const start = useRef(performance.now());
  const frame = useRef(-1);
  const finished = useRef(-1);

  const write = (d: Display) => {
    const m = mesh.current;
    if (!m) return;
    const seeds = layoutSeeds(d, seat, variant);
    const n = Math.min(seeds.length, CAP);
    for (let i = 0; i < n; i++) {
      const s = seeds[i]!;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, (i * 1.7) % 6.283, 0);
      dummy.scale.set(1.15, 0.8, 1.5);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tones[s.tone % tones.length]!);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  // The board as it stands (and again when a sowing has finished).
  useLayoutEffect(() => {
    if (!replay) write(display);
    invalidate();
  }, [display, replay, variant, seat, tones]);

  useEffect(() => {
    if (!replay) return;
    start.current = performance.now();
    frame.current = -1;
    finished.current = -1;
    invalidate();
  }, [replay, invalidate]);

  useFrame(() => {
    if (!replay) return;
    const ms = performance.now() - start.current;
    const tl = replay.timeline;
    const d = stateAt(tl, ms);
    write(d);
    const idx = tl.frames.findIndex((f) => ms >= f.t0 && ms < f.t1);
    if (idx !== frame.current) {
      frame.current = idx;
      onStep(d);
    }
    meter(replay.token);
    if (ms >= tl.totalMs + 220) {
      if (finished.current !== replay.token) {
        finished.current = replay.token;
        onDone(replay.token);
      }
      return;
    }
    invalidate();
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAP]} frustumCulled={false}>
      <sphereGeometry args={[0.1, 12, 8]} />
      <meshStandardMaterial roughness={0.45} metalness={0.1} />
    </instancedMesh>
  );
}
