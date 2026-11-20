import { useEffect, useState } from 'react';
import { Redirect, useRouter, type Href } from 'expo-router';
import { Text } from '@dyce/ui';
import { useSession } from '@/features/auth/use-session';
import { invitesApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import { InviteFrame } from '../components/InviteFrame';
import { rememberInvite } from '../pending-invite';
import { useLinkPhone } from '../use-invites';

/**
 * An invite link opened inside the installed app (universal link or dyce:// link). Not signed up yet: remember
 * the invite and go to sign-up with it. Signed in: ask the server to join it (it only joins this account's own
 * number) and open the game, or just the chats.
 */
export function NativeInviteGate({ token }: { token: string }) {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const phone = useLinkPhone();
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    track({ name: 'invite_opened', surface: 'app' });
    if (status === 'signedOut') {
      void rememberInvite({ token, phone }).then(() => setRemembered(true));
      return;
    }
    let alive = true;
    void invitesApi
      .claim(token)
      .then((res) => {
        const match = res.joined.find((j) => j.matchId)?.matchId;
        if (alive) router.replace((match ? `/g/${match}` : '/chat') as Href);
      })
      .catch(() => alive && router.replace('/chat' as Href));
    return () => {
      alive = false;
    };
  }, [status, token, phone, router]);

  if (status === 'signedOut' && remembered) return <Redirect href={`/i/${token}/join` as Href} />;
  return (
    <InviteFrame scroll={false}>
      <Text color="sub" accessibilityLiveRegion="polite">
        Opening your invite…
      </Text>
    </InviteFrame>
  );
}
