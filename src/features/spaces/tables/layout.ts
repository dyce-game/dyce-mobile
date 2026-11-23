/**
 * Where everything sits on the 3D card table, as plain numbers (metres, radians): the camera, the seats
 * around the round table, your hand fanned in front of the camera, the two piles. The scene only draws what
 * this says, and the screen overlays (names, counts) use `project` to land on the same spots. No React, no
 * three.js here, so the maths is unit tested.
 *
 * World: the table top is the plane y = 0, its centre the origin. You sit at +z looking towards -z; x is to
 * your right. Seats go clockwise from you (so the next player is on your left, x < 0).
 */

export type Vec3 = [number, number, number];

export const CARD_W = 0.26;
export const CARD_H = CARD_W * 1.5;
export const TABLE_R = 1.16;
export const FELT_R = 1.02;
/** How far from the centre a seat's cards lie. */
export const SEAT_R = 0.84;
/** Backs shown in a fan at most; the count badge says the rest. */
export const MAX_BACKS = 6;

// ---- poses ------------------------------------------------------------------------------------------

/** A card's place: position, orientation (Euler YXZ: yaw, then tilt, then roll in the card's own plane), turn over, size. */
export type Pose = {
  x: number;
  y: number;
  z: number;
  ry: number;
  rx: number;
  rz: number;
  flip: number;
  s: number;
};

export const POSE_KEYS: readonly (keyof Pose)[] = ['x', 'y', 'z', 'ry', 'rx', 'rz', 'flip', 's'];

export const pose = (p: Partial<Pose> = {}): Pose => ({
  x: 0,
  y: 0,
  z: 0,
  ry: 0,
  rx: 0,
  rz: 0,
  flip: 0,
  s: 1,
  ...p,
});

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    ry: a.ry + (b.ry - a.ry) * t,
    rx: a.rx + (b.rx - a.rx) * t,
    rz: a.rz + (b.rz - a.rz) * t,
    flip: a.flip + (b.flip - a.flip) * t,
    s: a.s + (b.s - a.s) * t,
  };
}

/** Lying on the table, face up, the top of the card pointing away from you. */
export const LYING_RX = -Math.PI / 2;

// ---- camera -----------------------------------------------------------------------------------------

export type CameraRig = {
  pos: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
  aspect: number;
  /** Unit vectors of the camera. */
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** How far the camera looks down, radians. */
  pitch: number;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const FOV = 40;
export const PITCH = (54 * Math.PI) / 180;

/**
 * A camera behind your seat, looking down at the table, far enough back that the whole table fits the width
 * of the screen (portrait phones) or its height (tablets, landscape). It looks a little in front of the
 * centre so the table sits in the upper half and your hand has the lower part of the screen.
 */
export function cameraRig(aspect: number): CameraRig {
  const a = Math.max(0.3, Math.min(2.5, aspect));
  const half = Math.tan((FOV * Math.PI) / 360);
  const need = TABLE_R + 0.2;
  const byWidth = need / (half * a);
  const byHeight = (need * 1.05) / half;
  const dist = Math.max(byWidth, byHeight);
  const target: Vec3 = [0, 0, 0.3 * Math.min(1.4, dist / 4)];
  const pos: Vec3 = [
    target[0],
    target[1] + dist * Math.sin(PITCH),
    target[2] + dist * Math.cos(PITCH),
  ];
  const forward = norm(sub(target, pos));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { pos, target, fov: FOV, aspect: a, right, up, forward, pitch: PITCH };
}

/** Where a world point lands on screen: x and y in -1..1 (y up), plus its depth in front of the camera. */
export function project(rig: CameraRig, p: Vec3): { x: number; y: number; depth: number } {
  const v = sub(p, rig.pos);
  const depth = dot(v, rig.forward);
  const half = Math.tan((rig.fov * Math.PI) / 360);
  return {
    x: dot(v, rig.right) / (depth * half * rig.aspect),
    y: dot(v, rig.up) / (depth * half),
    depth,
  };
}

/** The same point as a CSS-style position on a screen: left and top in percent. */
export function projectPct(rig: CameraRig, p: Vec3): { left: number; top: number } {
  const s = project(rig, p);
  return { left: (s.x * 0.5 + 0.5) * 100, top: (0.5 - s.y * 0.5) * 100 };
}

// ---- seats ------------------------------------------------------------------------------------------

/**
 * The angle of each opponent's seat, measured from the seat opposite you (0), left to right as you see
 * them: one opponent sits across from you, more spread along the far side (never closer than the table's
 * flanks).
 */
export function opponentOffsets(m: number): number[] {
  if (m <= 0) return [];
  if (m === 1) return [0];
  const span = Math.min((160 * Math.PI) / 180, ((52 * Math.PI) / 180) * (m - 1));
  return Array.from({ length: m }, (_, j) => -span / 2 + (span * j) / (m - 1));
}

/** The angle around the table of seat `index` of `total` (0 is you, at +z): x = -r sin(phi), z = r cos(phi). */
export function seatPhi(index: number, total: number): number {
  if (index <= 0) return 0;
  return Math.PI + (opponentOffsets(total - 1)[index - 1] ?? 0);
}

/** A point at radius `r` from the centre in the direction of a seat. */
export function onTable(phi: number, r: number, y = 0): Vec3 {
  return [-r * Math.sin(phi), y, r * Math.cos(phi)];
}

/**
 * An opponent's hand: `count` card backs fanned in front of their seat, lying propped up so their backs
 * face you. At most MAX_BACKS are drawn.
 */
export function backFan(count: number, phi: number): Pose[] {
  const n = Math.min(count, MAX_BACKS);
  const tangent: Vec3 = [Math.cos(phi + Math.PI), 0, -Math.sin(phi + Math.PI)];
  const base = onTable(phi, SEAT_R + 0.05);
  const spread = Math.min(0.085, 0.4 / Math.max(1, n));
  return Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2;
    return pose({
      x: base[0] + tangent[0] * k * spread,
      y: 0.07 + 0.003 * i - Math.abs(k) * 0.004,
      z: base[2] + tangent[2] * k * spread,
      ry: phi + Math.PI,
      rx: -1.05,
      rz: -k * 0.16,
      flip: Math.PI,
      s: 0.78,
    });
  });
}

// ---- piles ------------------------------------------------------------------------------------------

export const DECK_AT: Vec3 = [-0.24, 0, 0.02];
export const DISCARD_AT: Vec3 = [0.24, 0, 0.02];

/** The height of the draw pile, from how many cards are in it (a stack of a few millimetres per ten cards). */
export const deckHeight = (count: number): number =>
  Math.min(0.085, 0.004 + Math.max(0, count) * 0.0013);

/** The card on top of the draw pile, lying face down. */
export function deckTopPose(count: number): Pose {
  return pose({
    x: DECK_AT[0],
    y: deckHeight(count) + 0.004,
    z: DECK_AT[2],
    rx: LYING_RX,
    flip: Math.PI,
  });
}

/** A small steady number from a text, so a card always lands at the same crooked angle. */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** A card in the discard pile: slightly off-square (the same crooked angle for the same `key`), stacked in order. `index` counts from the bottom of what is shown. */
export function discardPose(key: string, index: number): Pose {
  const j = hash01(key);
  const k = hash01(`z${key}`);
  return pose({
    x: DISCARD_AT[0] + (j - 0.5) * 0.05,
    y: 0.012 + index * 0.0045,
    z: DISCARD_AT[2] + (k - 0.5) * 0.05,
    rx: LYING_RX,
    ry: (j - 0.5) * 0.7,
  });
}

// ---- your hand --------------------------------------------------------------------------------------

export type HandOptions = {
  /** Index of the card you picked up (lifted), or -1. */
  picked?: number;
  /** Indexes you can play (nudged up a little). */
  playable?: ReadonlySet<number>;
};

/**
 * Your hand fanned in front of the camera. Laid out in screen terms so it fits any screen: cards a fixed
 * fraction of the screen's width, overlapping so that the whole hand spans at most 92% of it, on a gentle
 * arc with the outer cards rolled outwards. Returned as world poses facing the camera.
 */
export function handLayout(count: number, rig: CameraRig, opts: HandOptions = {}): Pose[] {
  if (count <= 0) return [];
  const dist = 1.4;
  const half = Math.tan((rig.fov * Math.PI) / 360);
  const halfW = dist * half * rig.aspect;
  const halfH = dist * half;
  // Card width as a share of the screen width: big for few cards, smaller for many, never tiny.
  const shareFull = rig.aspect > 1 ? 0.2 : 0.43;
  const cardNdc = Math.max(0.12, Math.min(shareFull, 1.84 / (count * 0.52 + 0.5))); // full width of the screen is 2
  const worldW = cardNdc * halfW;
  const maxSpan = 1.84 - cardNdc;
  const step = count > 1 ? Math.min(cardNdc * 0.62, maxSpan / (count - 1)) : 0;
  const scale = worldW / CARD_W;
  const vBase = rig.aspect > 1 ? -0.62 : -0.5;
  return Array.from({ length: count }, (_, i) => {
    const k = i - (count - 1) / 2;
    const u = k * step;
    const edge = count > 1 ? k / ((count - 1) / 2) : 0; // -1..1
    const picked = opts.picked === i;
    const lift = picked ? 0.17 : opts.playable?.has(i) ? 0.035 : 0;
    const v = vBase - 0.05 * edge * edge + lift;
    const d = dist - i * 0.003 - (picked ? 0.05 : 0);
    const f = d / dist;
    const wx =
      rig.pos[0] + rig.forward[0] * d + rig.right[0] * u * halfW * f + rig.up[0] * v * halfH * f;
    const wy =
      rig.pos[1] + rig.forward[1] * d + rig.right[1] * u * halfW * f + rig.up[1] * v * halfH * f;
    const wz =
      rig.pos[2] + rig.forward[2] * d + rig.right[2] * u * halfW * f + rig.up[2] * v * halfH * f;
    return pose({ x: wx, y: wy, z: wz, rx: -rig.pitch, rz: -edge * 0.3, s: scale * f });
  });
}

/** The card width on screen as a fraction of the screen's width, for a given hand size (for touch sizing and tests). */
export function handCardShare(count: number, aspect: number): number {
  const shareFull = aspect > 1 ? 0.2 : 0.43;
  return Math.max(0.12, Math.min(shareFull, 1.84 / (count * 0.52 + 0.5))) / 2;
}

/**
 * How many points wide the visible strip of each hand card is on a screen `screenPts` wide: below 44 the
 * cards can still be tapped but the list is the comfortable way (the table offers both).
 */
export function handStripPts(count: number, screenPts: number, aspect: number): number {
  if (count <= 1) return screenPts * handCardShare(1, aspect);
  const cardNdc = handCardShare(count, aspect) * 2;
  const step = Math.min(cardNdc * 0.62, (1.84 - cardNdc) / (count - 1));
  return (step / 2) * screenPts;
}

// ---- ease and arcs ----------------------------------------------------------------------------------

export type Ease = 'linear' | 'out' | 'inout' | 'back';

export function ease(kind: Ease, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (kind) {
    case 'linear':
      return x;
    case 'out':
      return 1 - Math.pow(1 - x, 3);
    case 'back': {
      const c = 1.4;
      return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
    }
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

// ---- name chips -------------------------------------------------------------------------------------

export type ChipSpot = { left: number; top: number; width: number };

/**
 * Where each opponent's name chip goes on a screen `screenW` points wide, given the spots (left and top in
 * percent, in seat order) their cards project to. Up to four opponents sit as they are; with more the chips
 * get narrower, then alternate between two heights so none covers another, and always stay on the screen.
 */
export function chipLayout(
  spots: readonly { left: number; top: number }[],
  screenW: number,
): ChipSpot[] {
  if (spots.length === 0) return [];
  const gap = (xs: number[]): number => {
    let g = Infinity;
    for (let i = 1; i < xs.length; i++) g = Math.min(g, ((xs[i]! - xs[i - 1]!) / 100) * screenW);
    return g;
  };
  const xs = spots.map((s) => s.left);
  const staggered = spots.length > 3 && gap(xs) < 70;
  const sameRow = staggered
    ? Math.min(gap(xs.filter((_, i) => i % 2 === 0)), gap(xs.filter((_, i) => i % 2 === 1)))
    : gap(xs);
  const width = Math.max(
    56,
    Math.min(96, Math.floor((Number.isFinite(sameRow) ? sameRow : 96) * 0.94)),
  );
  const half = ((width / 2 + 6) / screenW) * 100;
  return spots.map((s, i) => ({
    left: Math.max(half, Math.min(100 - half, s.left)),
    top: s.top - (staggered && i % 2 === 1 ? 7 : 0),
    width,
  }));
}
