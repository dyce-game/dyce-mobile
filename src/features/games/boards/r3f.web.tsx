// React Three Fiber in the browser (the Expo web preview and the guest web game): the same scene on a DOM
// canvas. The pixel ratio is capped so a hi-dpi laptop or a phone browser does not shade 4x the pixels.
import { Canvas as FiberCanvas, useFrame, useThree } from '@react-three/fiber';
import type { ComponentProps } from 'react';

export function Canvas(props: ComponentProps<typeof FiberCanvas>) {
  return <FiberCanvas dpr={[1, 1.5]} {...props} />;
}

export { useFrame, useThree };
