import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateInviteRequest } from '@dyce/shared';
import { invitesApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import { phoneFromFragment } from './invite-link';

/** The data behind the landing page. Public: no account needed. */
export function useInviteQuery(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () => invitesApi.get(token),
    retry: false,
    staleTime: 30_000,
  });
}

/** Sends an SMS invite. The number is only held in memory while the request runs. */
export function useSendInvite() {
  return useMutation({
    mutationFn: (input: CreateInviteRequest) => invitesApi.create(input),
    onSuccess: (_res, input) => track({ name: 'invite_sent', game: input.gameSlug }),
  });
}

/**
 * The invited number from the link's fragment (`#p=…`), read on this device only. In a browser it is
 * `location.hash`; in the app it comes from the link that opened it.
 */
export function useLinkPhone(): string | null {
  const [phone, setPhone] = useState<string | null>(() =>
    Platform.OS === 'web' ? phoneFromFragment(globalThis.location?.hash) : null,
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    const read = (url: string | null) => {
      const hash = url && url.includes('#') ? url.slice(url.indexOf('#')) : null;
      const found = phoneFromFragment(hash);
      if (alive && found) setPhone(found);
    };
    void Linking.getInitialURL().then(read);
    const sub = Linking.addEventListener('url', (e) => read(e.url));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return phone;
}
