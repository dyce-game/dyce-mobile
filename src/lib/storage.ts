import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorage } from '@/features/auth/session-store';

/**
 * Tokens live in the iOS Keychain / Android Keystore via expo-secure-store. SecureStore doesn't exist on
 * web, so the (guest) web build falls back to localStorage; web sessions are lower-trust by design.
 */
const native: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const web: KeyValueStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => void globalThis.localStorage?.setItem(key, value),
  removeItem: async (key) => void globalThis.localStorage?.removeItem(key),
};

export const secureStorage: KeyValueStorage = Platform.OS === 'web' ? web : native;
