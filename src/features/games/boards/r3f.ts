// React Three Fiber for the phone: its own entry (expo-gl). The web build uses r3f.web.ts instead. Everything
// else in the game imports from here so the scene code is the same on both.
export { Canvas, useFrame, useThree } from '@react-three/fiber/native';
