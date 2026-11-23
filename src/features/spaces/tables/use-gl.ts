import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Can this device draw the 3D table? On the phone the GL surface (expo-gl) is always there; in a browser
 * WebGL may be switched off or missing (old machines, some in-app browsers, remote desktops), so ask once.
 * A GL context that dies later is caught by the table's error boundary, which falls back the same way.
 */
export function canUseWebGL(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const doc = (
      globalThis as { document?: { createElement(t: string): { getContext(k: string): unknown } } }
    ).document;
    if (!doc) return false;
    const canvas = doc.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function useWebGL(): boolean {
  const [ok] = useState(canUseWebGL);
  return ok;
}

/**
 * Is a screen reader running? Then the card list is the table (the 3D scene has no accessibility tree). On the
 * web React Native Web answers "yes" to everyone, so there the person picks the flat table from the menu.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => alive && setOn(v));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}
