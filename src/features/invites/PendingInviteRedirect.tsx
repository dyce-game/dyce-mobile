import { useEffect } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useSession } from '@/features/auth/use-session';
import { useInviteLanding } from './pending-invite';

/**
 * When onboarding is finished and an invite put a game waiting for this person, open it instead of the
 * empty chat list ("Straight into Kemdi's game"). Mounted once, in the root layout.
 */
export function PendingInviteRedirect() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const nextStep = useSession((s) => s.nextStep);
  const matchId = useInviteLanding((s) => s.matchId);
  useEffect(() => {
    if (status !== 'signedIn' || nextStep !== 'done' || !matchId) return;
    useInviteLanding.getState().setMatch(null);
    router.replace(`/g/${matchId}` as Href);
  }, [status, nextStep, matchId, router]);
  return null;
}
