import { Component, useCallback, useState, type ErrorInfo, type ReactNode } from 'react';
import { Platform } from 'react-native';

/**
 * Is there a WebGL context to draw on? On the phone expo-gl provides one; in a browser it is asked for once.
 * A device without it (some old Android WebViews, a locked-down browser) gets a clear message and the flat,
 * slider-driven view instead of a blank board.
 */
let cached: boolean | null = null;
export function webglAvailable(): boolean {
  if (Platform.OS !== 'web') return true;
  // Dev builds: `localStorage['dyce.nowebgl'] = '1'` forces the flat fallback, to check it without a device.
  if (__DEV__ && globalThis.localStorage?.getItem('dyce.nowebgl') === '1') return false;
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Where a board keeps whether its 3D scene works: false from the start when there is no WebGL, and false
 * after the canvas throws while it renders (`fail`).
 */
export function useSceneSupport(): { ok: boolean; fail: () => void } {
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  return { ok: !failed && webglAvailable(), fail };
}

/** Catches a canvas that throws (context lost on creation, a driver that rejects a shader) and reports it. */
export class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { broken: boolean }
> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    return this.state.broken ? null : this.props.children;
  }
}
