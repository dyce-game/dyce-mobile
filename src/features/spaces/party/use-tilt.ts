import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { newTilt, stepTilt, type TiltEvent } from './charades-logic';

export type TiltSupport = 'unknown' | 'yes' | 'no';

/**
 * Reads the accelerometer (expo-sensors) while `enabled` and calls `onTilt` once per nod: down is "got it",
 * back is "skip" (`stepTilt` does the maths). On the web, on a device without the sensor, or when the
 * permission is refused it reports `no` and does nothing: the buttons are always there as the other way in.
 * The module loads lazily so a platform without it never pays for it.
 */
export function useTilt(
  enabled: boolean,
  flip: boolean,
  onTilt: (event: Exclude<TiltEvent, null>) => void,
): TiltSupport {
  const [support, setSupport] = useState<TiltSupport>('unknown');
  const cb = useRef(onTilt);
  cb.current = onTilt;

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') {
      setSupport('no');
      return;
    }
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    let tilt = newTilt();
    void (async () => {
      try {
        const { Accelerometer } = await import('expo-sensors');
        if (!(await Accelerometer.isAvailableAsync())) return setSupport('no');
        const perm = await Accelerometer.requestPermissionsAsync();
        if (!perm.granted) return setSupport('no');
        if (cancelled) return;
        Accelerometer.setUpdateInterval(60);
        sub = Accelerometer.addListener(({ z }) => {
          const r = stepTilt(tilt, z, Date.now(), flip);
          tilt = r.state;
          if (r.event) cb.current(r.event);
        });
        setSupport('yes');
      } catch {
        setSupport('no');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled, flip]);

  return support;
}
