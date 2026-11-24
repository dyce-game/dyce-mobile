import { useSyncExternalStore } from 'react';
import { config } from './config';
import { secureStorage } from './storage';
import { consentAllowed, parseStoredConsent, type StoredConsent } from './privacy-consent-logic';

const KEY = 'dyce.privacy.diagnostics';

let stored: StoredConsent = null;
let loaded = false;
const listeners = new Set<() => void>();
/** Called when the effective answer changes (and once it is first known): analytics and crash reports follow it. */
const appliers = new Set<(allowed: boolean) => void>();

const allowed = () => consentAllowed(stored, config.appEnv);

function emit() {
  for (const l of listeners) l();
  for (const a of appliers) a(allowed());
}

/** Reads the saved choice once. Safe to call many times. */
export async function loadConsent(): Promise<boolean> {
  if (!loaded) {
    stored = parseStoredConsent(await secureStorage.getItem(KEY).catch(() => null));
    loaded = true;
    emit();
  }
  return allowed();
}

/** Saves the person's choice and applies it at once (turning it off also drops anything not yet sent). */
export async function setConsent(grant: boolean): Promise<void> {
  stored = grant ? 'granted' : 'denied';
  loaded = true;
  await secureStorage.setItem(KEY, stored).catch(() => undefined);
  emit();
}

/** The answer before the stored choice has been read: the build's default. */
export const defaultAllowed = () => consentAllowed(null, config.appEnv);

export function onConsentChange(apply: (allowed: boolean) => void): void {
  appliers.add(apply);
}

/** For the Settings switch. */
export function useDiagnosticsConsent(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      void loadConsent();
      return () => void listeners.delete(cb);
    },
    allowed,
    allowed,
  );
}
