/**
 * A pinhole camera in plain numbers, so the scene (which places the real three.js camera from it) and the
 * touch layer (which has to turn a finger position into a point on the table, or a point on the table into
 * a screen position for a label) agree exactly. Metres, y up, three.js's right-handed frame.
 */
export type V3 = readonly [number, number, number];

export type CameraSpec = {
  /** The point the camera looks at. */
  target: V3;
  /** Unit vector from the target towards the camera. */
  dir: V3;
  /** Distance from the target (the least; a narrow screen pulls back when `fitWidth` needs it). */
  distance: number;
  /** Vertical field of view in degrees. */
  fovDeg: number;
  /** Keep at least this much width (m, at the target) in view. */
  fitWidth?: number;
};

export type CameraPose = { position: V3; target: V3; fovDeg: number; aspect: number };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const RAD = Math.PI / 180;

export function cameraPose(spec: CameraSpec, width: number, height: number): CameraPose {
  const aspect = width / Math.max(1, height);
  const tanV = Math.tan((spec.fovDeg * RAD) / 2);
  let distance = spec.distance;
  if (spec.fitWidth) distance = Math.max(distance, spec.fitWidth / 2 / (tanV * aspect));
  const d = norm(spec.dir);
  return {
    position: [
      spec.target[0] + d[0] * distance,
      spec.target[1] + d[1] * distance,
      spec.target[2] + d[2] * distance,
    ],
    target: spec.target,
    fovDeg: spec.fovDeg,
    aspect,
  };
}

function basis(pose: CameraPose) {
  const f = norm(sub(pose.target, pose.position));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanV = Math.tan((pose.fovDeg * RAD) / 2);
  return { f, r, u, tanV, tanH: tanV * pose.aspect };
}

/** A world point on screen (points from the top-left of a `width` x `height` view); null if behind the camera. */
export function project(
  pose: CameraPose,
  p: V3,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const { f, r, u, tanV, tanH } = basis(pose);
  const rel = sub(p, pose.position);
  const z = dot(rel, f);
  if (z <= 0.0001) return null;
  const nx = dot(rel, r) / (z * tanH);
  const ny = dot(rel, u) / (z * tanV);
  return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height };
}

/**
 * The point where the ray through a screen position meets the plane `n · p = d` (a horizontal floor is
 * `n = [0, 1, 0]`, `d = height`; a wall facing the camera is `n = [0, 0, 1]`); null if it never does.
 */
export function unprojectPlane(
  pose: CameraPose,
  x: number,
  y: number,
  width: number,
  height: number,
  n: V3,
  d: number,
): V3 | null {
  const { f, r, u, tanV, tanH } = basis(pose);
  const nx = (x / Math.max(1, width)) * 2 - 1;
  const ny = 1 - (y / Math.max(1, height)) * 2;
  const ray: V3 = [
    f[0] + r[0] * nx * tanH + u[0] * ny * tanV,
    f[1] + r[1] * nx * tanH + u[1] * ny * tanV,
    f[2] + r[2] * nx * tanH + u[2] * ny * tanV,
  ];
  const denom = dot(n, ray);
  if (Math.abs(denom) < 1e-9) return null;
  const t = (d - dot(n, pose.position)) / denom;
  if (t <= 0) return null;
  return [
    pose.position[0] + ray[0] * t,
    pose.position[1] + ray[1] * t,
    pose.position[2] + ray[2] * t,
  ];
}

/** The point where the ray through a screen position meets the horizontal plane `y = planeY`. */
export function unproject(
  pose: CameraPose,
  x: number,
  y: number,
  width: number,
  height: number,
  planeY = 0,
): V3 | null {
  return unprojectPlane(pose, x, y, width, height, [0, 1, 0], planeY);
}
