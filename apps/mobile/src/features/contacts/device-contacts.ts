import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import type { DeviceContact } from '@dyce/shared';

export type ContactsPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type PermissionInfo = { state: ContactsPermission; canAskAgain: boolean };

/**
 * DEV ONLY. Browsers have no address book, so in a dev build on web we use this small made-up one to
 * exercise the whole flow. The numbers are fictional (555 range). Never active in production builds or on
 * a phone.
 */
const useDevSample = Platform.OS === 'web' && __DEV__;
let devSampleGranted = false;
/** Dev only: localStorage `dev.contacts = deny` simulates tapping "Don't allow". */
const devDeny = (): boolean => globalThis.localStorage?.getItem('dev.contacts') === 'deny';
const DEV_SAMPLE: DeviceContact[] = [
  { id: 'd1', name: 'Tunde (dev sample)', phones: ['0803 555 0777'] },
  { id: 'd2', name: 'Ngozi (dev sample)', phones: ['+234 803 555 0888', '0803 555 0888'] },
  { id: 'd3', name: 'Uncle Bode (not on Dyce)', phones: ['0803 555 0999'] },
  { id: 'd4', name: 'GTBank', phones: ['737'] },
];

function toState(status: string): ContactsPermission {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getContactsPermission(): Promise<PermissionInfo> {
  if (useDevSample) {
    if (devDeny()) return { state: 'denied', canAskAgain: false };
    return { state: devSampleGranted ? 'granted' : 'undetermined', canAskAgain: true };
  }
  if (Platform.OS === 'web') return { state: 'unavailable', canAskAgain: false };
  const r = await Contacts.getPermissionsAsync();
  return { state: toState(r.status), canAskAgain: r.canAskAgain };
}

/** Shows the OS permission prompt (only call after our own explainer). */
export async function requestContactsPermission(): Promise<PermissionInfo> {
  if (useDevSample) {
    if (devDeny()) return { state: 'denied', canAskAgain: false };
    devSampleGranted = true;
    return { state: 'granted', canAskAgain: true };
  }
  if (Platform.OS === 'web') return { state: 'unavailable', canAskAgain: false };
  const r = await Contacts.requestPermissionsAsync();
  return { state: toState(r.status), canAskAgain: r.canAskAgain };
}

const PAGE_SIZE = 500;

/** Reads the address book page by page, keeping only id, name and numbers (nothing else is read). */
export async function loadDeviceContacts(): Promise<DeviceContact[]> {
  if (useDevSample) return DEV_SAMPLE;
  const out: DeviceContact[] = [];
  let pageOffset = 0;
  for (;;) {
    const page = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      pageSize: PAGE_SIZE,
      pageOffset,
    });
    for (const c of page.data) {
      const phones = (c.phoneNumbers ?? []).map((p) => p.number ?? p.digits ?? '').filter(Boolean);
      if (phones.length > 0) out.push({ id: c.id, name: c.name ?? '', phones });
    }
    if (!page.hasNextPage) break;
    pageOffset += PAGE_SIZE;
  }
  return out;
}
