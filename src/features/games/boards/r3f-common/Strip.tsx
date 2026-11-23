import type { V3 } from './camera-math';

/**
 * A flat ribbon on the floor of the scene between two points (an aim line, a lane marking): a plane lying
 * down, turned about the vertical to run from `a` to `b`. Heights are taken from `a`.
 */
export function Strip({
  a,
  b,
  width = 0.006,
  color = '#FFFFFF',
  opacity = 0.8,
  lift = 0,
}: {
  a: V3;
  b: V3;
  width?: number;
  color?: string;
  opacity?: number;
  lift?: number;
}) {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.0005) return null;
  return (
    <group
      position={[(a[0] + b[0]) / 2, a[1] + lift, (a[2] + b[2]) / 2]}
      rotation={[0, Math.atan2(-dx, -dz), 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, len]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}
