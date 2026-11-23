import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@/features/games/boards/r3f';
import {
  backArt,
  buildMesh,
  faceArt,
  splitArt,
  whotShapePolys,
  CRAZY_PALETTE,
  type Poly,
} from './card-art';
import type { ActorSpec, TableDirector } from './director';
import type { Face, TableGame } from './faces';
import {
  CARD_H,
  CARD_W,
  DECK_AT,
  FELT_R,
  SEAT_R,
  TABLE_R,
  deckHeight,
  deckTopPose,
  onTable,
  seatPhi,
  type CameraRig,
} from './layout';

/**
 * The card table in 3D (React Three Fiber): a round table, the draw and discard piles, every card as two
 * flat pieces (a solid body and its art painted over it), the seat rings. It only draws what the director
 * and the model say; it decides nothing. The same scene runs on the phone's GL surface and in the browser.
 *
 * Cards are lit by nothing (their colours are the design's colours), so a card costs two draw calls per
 * visible side. The canvas draws on demand: frames only while something moves.
 */

type Geo = { body: THREE.BufferGeometry; art: THREE.BufferGeometry };

const geoCache = new Map<string, Geo>();

function toGeometry(polys: readonly Poly[]): THREE.BufferGeometry {
  const m = buildMesh(polys);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.colors), 3));
  return g;
}

/** The two geometries of a face (or of a game's card back when `face` is a game name), built once and kept. */
function geometryFor(face: Face | TableGame, isBack = false): Geo {
  const key = typeof face === 'string' ? `back:${face}` : isBack ? `back:${face.game}` : face.key;
  let hit = geoCache.get(key);
  if (!hit) {
    const polys =
      typeof face === 'string' ? backArt(face) : isBack ? backArt(face.game) : faceArt(face);
    const { body, art } = splitArt(polys);
    hit = { body: toGeometry(body), art: toGeometry(art) };
    geoCache.set(key, hit);
  }
  return hit;
}

const FACE_Z = 0.004;

function useMaterials() {
  return useMemo(
    () => ({
      body: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      art: new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      glow: new THREE.MeshBasicMaterial({ color: '#E3A93B', toneMapped: false }),
      dim: new THREE.MeshBasicMaterial({
        color: '#150C08',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        toneMapped: false,
      }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    }),
    [],
  );
}

type Mats = ReturnType<typeof useMaterials>;

const glowGeo = new THREE.PlaneGeometry(1.1, 1.62);
const dimGeo = new THREE.PlaneGeometry(1, 1.5);
const hitGeo = new THREE.PlaneGeometry(1, 1.5);

// ---- one card ---------------------------------------------------------------------------------------

type CardProps = {
  spec: ActorSpec;
  game: TableGame;
  mats: Mats;
  register: (id: string, g: THREE.Group | null) => void;
  selected: boolean;
  dim: boolean;
  onPick: (id: string) => void;
};

const CardActor = memo(function CardActor({
  spec,
  game,
  mats,
  register,
  selected,
  dim,
  onPick,
}: CardProps) {
  const front = spec.face ? geometryFor(spec.face) : null;
  const back = geometryFor(game);
  const hand = spec.role === 'hand';
  return (
    <group ref={(g) => register(spec.id, g)} rotation-order="YXZ" visible={false}>
      <group>
        <group>
          {front ? (
            <>
              {selected ? (
                <mesh
                  geometry={glowGeo}
                  material={mats.glow}
                  position-z={FACE_Z * 0.5}
                  renderOrder={1}
                />
              ) : null}
              <mesh
                geometry={front.body}
                material={mats.body}
                position-z={FACE_Z}
                renderOrder={1}
              />
              <mesh geometry={front.art} material={mats.art} position-z={FACE_Z} renderOrder={2} />
              {dim ? (
                <mesh
                  geometry={dimGeo}
                  material={mats.dim}
                  position-z={FACE_Z + 0.003}
                  renderOrder={3}
                />
              ) : null}
              {hand ? (
                <mesh
                  geometry={hitGeo}
                  material={mats.hit}
                  position-z={FACE_Z + 0.004}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(spec.id);
                  }}
                />
              ) : null}
            </>
          ) : null}
        </group>
        <group rotation-y={Math.PI}>
          <mesh geometry={back.body} material={mats.body} position-z={FACE_Z} renderOrder={1} />
          <mesh geometry={back.art} material={mats.art} position-z={FACE_Z} renderOrder={2} />
        </group>
      </group>
    </group>
  );
});

// ---- the scene --------------------------------------------------------------------------------------

export type SceneProps = {
  game: TableGame;
  director: TableDirector;
  /** Bumps when the director's list of cards changed. */
  actorsVersion: number;
  rig: CameraRig;
  /** The hand actor held up, and whether it is your turn (cards you cannot play are dimmed). */
  selectedId: string | null;
  dimUnplayable: boolean;
  playableKeys: ReadonlySet<string>;
  seats: { id: string; index: number; current: boolean }[];
  colorInForce: keyof typeof CRAZY_PALETTE | null;
  askedShape: string | null;
  deckCount: number;
  direction: 1 | -1;
  /** A seat to pulse (Skip, Draw Two...), changing `pulse.at` starts a new pulse. */
  pulse: { seat: string; at: number; color: string } | null;
  reduced: boolean;
  onPick: (id: string) => void;
  onDeck: () => void;
  /** Called when the director dropped one-off cards, so the list re-renders. */
  onPruned: () => void;
};

const THEME: Record<
  TableGame,
  { room: string; felt: string; rim: string; ring: string; spot: string }
> = {
  whot: { room: '#120A06', felt: '#6B3E22', rim: '#3A2012', ring: '#9C6538', spot: '#FFD9A0' },
  'crazy-cards': {
    room: '#0B1714',
    felt: '#1F7A5A',
    rim: '#17312A',
    ring: '#3FA27C',
    spot: '#C8FFE6',
  },
};

export function CardTableScene(p: SceneProps) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const mats = useMaterials();
  const registry = useRef(new Map<string, THREE.Group>());
  const t = THEME[p.game];

  const register = useCallback((id: string, g: THREE.Group | null) => {
    if (g) registry.current.set(id, g);
    else registry.current.delete(id);
  }, []);

  useEffect(
    () => invalidate(),
    [
      invalidate,
      p.actorsVersion,
      p.rig,
      p.selectedId,
      p.deckCount,
      p.colorInForce,
      p.askedShape,
      p.pulse,
      p.dimUnplayable,
      p.direction,
    ],
  );

  const meter = useRef({ last: 0, frames: 0, worst: 0, since: 0 });
  const prunedRef = useRef(p.onPruned);
  prunedRef.current = p.onPruned;

  useFrame(() => {
    const now = performance.now();
    const { director } = p;
    if (director.prune(now)) prunedRef.current();
    const busy = director.store.step(now);
    for (const [id, g] of registry.current) {
      const pose = director.store.poseOf(id);
      if (!pose) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.set(pose.rx, pose.ry, pose.rz);
      g.scale.setScalar(CARD_W * pose.s);
      const flip = g.children[0] as THREE.Object3D;
      flip.rotation.y = pose.flip;
      const faceUp = Math.cos(pose.flip) >= 0;
      (flip.children[0] as THREE.Object3D).visible = faceUp;
      (flip.children[1] as THREE.Object3D).visible = !faceUp;
    }
    if (__DEV__ && busy) recordFrame(meter.current, now, gl);
    if (busy) invalidate();
  });

  const deck = deckTopPose(p.deckCount);
  const dh = deckHeight(p.deckCount);

  return (
    <>
      <color attach="background" args={[t.room]} />
      <CameraRig rig={p.rig} />
      <ambientLight intensity={1.6} color="#FFF1DD" />
      <directionalLight position={[0.6, 3, 2]} intensity={1.8} color="#FFF1DD" />

      {/* the room: a faint pool of light on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
        <circleGeometry args={[4.2, 40]} />
        <meshBasicMaterial color={t.rim} transparent opacity={0.35} />
      </mesh>

      {/* the table */}
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.22, 0.34, 0.6, 20]} />
        <meshStandardMaterial color="#1A0F0A" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[TABLE_R, TABLE_R * 0.97, 0.06, 56]} />
        <meshStandardMaterial color={t.rim} roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[FELT_R, 56]} />
        <meshStandardMaterial color={t.felt} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0035, 0]}>
        <ringGeometry args={[0.58, 0.6, 64]} />
        <meshBasicMaterial color={t.ring} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0022, 0]}>
        <circleGeometry args={[0.54, 40]} />
        <meshBasicMaterial color={t.spot} transparent opacity={0.07} />
      </mesh>

      {p.game === 'crazy-cards' ? (
        <ColourPad color={p.colorInForce} />
      ) : (
        <AskedShape shape={p.askedShape} />
      )}
      {p.game === 'crazy-cards' ? <Direction direction={p.direction} reduced={p.reduced} /> : null}

      {/* seat rings: the player to move is lit */}
      {p.seats.map((s) => (
        <SeatRing key={s.id} phi={seatPhi(s.index, p.seats.length)} current={s.current} />
      ))}
      <Burst pulse={p.pulse} seats={p.seats} reduced={p.reduced} />

      {/* the draw pile */}
      <group>
        <mesh position={[DECK_AT[0], dh / 2, DECK_AT[2]]}>
          <boxGeometry args={[CARD_W * 0.98, Math.max(0.004, dh), CARD_H * 0.98]} />
          <meshStandardMaterial color={p.game === 'whot' ? '#6A1424' : '#15120F'} roughness={0.8} />
        </mesh>
        <mesh
          position={[DECK_AT[0], dh + 0.004, DECK_AT[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            p.onDeck();
          }}
        >
          <planeGeometry args={[CARD_W * 1.1, CARD_H * 1.1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <DeckTop game={p.game} pose={deck} mats={mats} />
      </group>

      {/* every card */}
      {p.director.snapshot().map((spec) => (
        <CardActor
          key={spec.id}
          spec={spec}
          game={p.game}
          mats={mats}
          register={register}
          selected={spec.id === p.selectedId}
          dim={
            p.dimUnplayable &&
            spec.role === 'hand' &&
            spec.face !== null &&
            !p.playableKeys.has(spec.face.key)
          }
          onPick={p.onPick}
        />
      ))}
    </>
  );
}

/** The card on top of the draw pile (not an actor: it never moves). */
function DeckTop({
  game,
  pose,
  mats,
}: {
  game: TableGame;
  pose: { x: number; y: number; z: number };
  mats: Mats;
}) {
  const back = geometryFor(game);
  return (
    <group position={[pose.x, pose.y, pose.z]} rotation={[-Math.PI / 2, 0, 0]} scale={CARD_W}>
      <mesh geometry={back.body} material={mats.body} position-z={FACE_Z} renderOrder={1} />
      <mesh geometry={back.art} material={mats.art} position-z={FACE_Z} renderOrder={2} />
    </group>
  );
}

function CameraRig({ rig }: { rig: CameraRig }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...rig.pos);
    cam.fov = rig.fov;
    cam.near = 0.4;
    cam.far = 40;
    cam.lookAt(...rig.target);
    cam.updateProjectionMatrix();
  }, [camera, rig]);
  return null;
}

// ---- table furniture --------------------------------------------------------------------------------

const COLOR_HEX = {
  red: CRAZY_PALETTE.red[1],
  yellow: CRAZY_PALETTE.yellow[1],
  green: CRAZY_PALETTE.green[1],
  blue: CRAZY_PALETTE.blue[1],
};

/** Crazy Cards: a disc under the piles in the colour in force. */
function ColourPad({ color }: { color: keyof typeof CRAZY_PALETTE | null }) {
  if (!color) return null;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0045, 0]}>
      <mesh>
        <circleGeometry args={[0.5, 40]} />
        <meshBasicMaterial color={COLOR_HEX[color]} transparent opacity={0.38} />
      </mesh>
      <mesh>
        <ringGeometry args={[0.5, 0.53, 40]} />
        <meshBasicMaterial color={COLOR_HEX[color]} />
      </mesh>
    </group>
  );
}

/** Whot!: the shape a Whot card asked for, lying in the middle of the table. */
function AskedShape({ shape }: { shape: string | null }) {
  const geo = useMemo(
    () => (shape ? toGeometry(whotShapePolys(shape, 0, 0, 0.5, '#F3E6CC', 1)) : null),
    [shape],
  );
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        transparent: true,
        opacity: 0.5,
      }),
    [],
  );
  if (!geo) return null;
  return (
    <mesh
      geometry={geo}
      material={mat}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.0055, 0.0]}
      scale={0.8}
    />
  );
}

/** Crazy Cards: arrows around the middle showing which way play goes. */
function Direction({ direction, reduced }: { direction: 1 | -1; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const turn = useRef({ value: direction, from: direction, at: 0 });
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = turn.current;
    if (t.from !== direction) {
      t.from = direction;
      t.at = performance.now();
    }
    const k = reduced ? 1 : Math.min(1, (performance.now() - t.at) / 450);
    const e = 1 - Math.pow(1 - k, 3);
    g.scale.x = t.value + (direction - t.value) * e;
    if (k >= 1) t.value = direction;
    else invalidate();
  });
  const arrows = useMemo(() => [0, 1, 2, 3].map((i) => (i * Math.PI) / 2 + Math.PI / 4), []);
  return (
    <group ref={group} position={[0, 0.0048, 0]}>
      {arrows.map((a) => (
        // each arrow points clockwise as seen from above (towards the seat on your left first)
        <mesh
          key={a}
          position={[0.69 * Math.cos(a), 0, -0.69 * Math.sin(a)]}
          rotation={[-Math.PI / 2, 0, a - Math.PI / 2]}
        >
          <coneGeometry args={[0.05, 0.1, 3]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function SeatRing({ phi, current }: { phi: number; current: boolean }) {
  const [x, , z] = onTable(phi, SEAT_R + 0.06);
  return (
    <mesh position={[x, 0.0062, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.2, current ? 0.25 : 0.215, 32]} />
      <meshBasicMaterial
        color={current ? '#E3A93B' : '#FFFFFF'}
        transparent
        opacity={current ? 0.95 : 0.16}
      />
    </mesh>
  );
}

/** A ring that grows and fades at a seat when something happens to it (Skip, Draw Two, last card). */
function Burst({
  pulse,
  seats,
  reduced,
}: {
  pulse: SceneProps['pulse'];
  seats: SceneProps['seats'];
  reduced: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    const m = mesh.current;
    const mt = mat.current;
    if (!m || !mt) return;
    if (!pulse || reduced) {
      m.visible = false;
      return;
    }
    const seat = seats.find((s) => s.id === pulse.seat);
    const k = (performance.now() - pulse.at) / 900;
    if (!seat || k < 0 || k >= 1) {
      m.visible = false;
      return;
    }
    const [x, , z] = onTable(seatPhi(seat.index, seats.length), SEAT_R + 0.06);
    m.visible = true;
    m.position.set(x, 0.0085, z);
    m.scale.setScalar(1 + k * 2.2);
    mt.opacity = 0.85 * (1 - k);
    mt.color.set(pulse.color);
    invalidate();
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.2, 0.25, 32]} />
      <meshBasicMaterial ref={mat} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// ---- dev frame meter --------------------------------------------------------------------------------

/**
 * Dev only: frame times while cards move, left on `globalThis.__cardTable` for the frame-rate check (average
 * and worst frame, draw calls, triangles). Nothing is shipped or sent anywhere.
 */
function recordFrame(
  m: { last: number; frames: number; worst: number; since: number },
  now: number,
  gl: THREE.WebGLRenderer,
) {
  if (m.last === 0 || now - m.last > 400) {
    m.since = now;
    m.frames = 0;
    m.worst = 0;
  } else m.worst = Math.max(m.worst, now - m.last);
  m.last = now;
  m.frames++;
  (globalThis as { __cardTable?: unknown }).__cardTable = {
    frames: m.frames,
    avgFps: Math.round((m.frames / Math.max(1, now - m.since)) * 1000),
    worstFrameMs: Math.round(m.worst),
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
  };
}
