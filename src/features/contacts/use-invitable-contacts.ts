import { getLocales } from 'expo-localization';
import { useQuery } from '@tanstack/react-query';
import { prepareContacts } from '@dyce/shared';
import { contactsApi, sessionStore } from '@/lib/api';
import { getContactsPermission, loadDeviceContacts } from './device-contacts';
import { syncContactsWithInvitable, type InvitableContact } from './sync';

export type InvitableResult = { permission: 'granted' | 'needed'; contacts: InvitableContact[] };

/**
 * Contacts who are not on Dyce yet, for "Invite to play". Reads the address book only when the OS
 * permission was already given (this never shows the prompt: the Contacts screen explains first). Numbers
 * are matched on the server as before; the ones nobody owns stay on the device.
 */
export function useInvitableContacts() {
  return useQuery<InvitableResult>({
    queryKey: ['invitable-contacts'],
    queryFn: async () => {
      const permission = await getContactsPermission();
      if (permission.state !== 'granted') return { permission: 'needed', contacts: [] };
      const device = await loadDeviceContacts();
      const region = sessionStore.getState().country ?? getLocales()[0]?.regionCode ?? undefined;
      const prepared = prepareContacts(device, region);
      const res = await syncContactsWithInvitable(prepared, (n) => contactsApi.match(n));
      return { permission: 'granted', contacts: res.invitable };
    },
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnMount: 'always',
  });
}
