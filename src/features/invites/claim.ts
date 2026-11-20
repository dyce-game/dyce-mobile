import { invitesApi } from '@/lib/api';
import { clearPendingInvite, getPendingInvite, useInviteLanding } from './pending-invite';

/**
 * Right after the profile exists: ask the server to join every invite that was sent to this number, then
 * remember which game to open when onboarding ends. Never blocks or fails sign-up: a person who was not
 * invited (or whose request failed) simply continues, and the invite is picked up on the next attempt.
 */
export async function claimInviteAfterSignup(): Promise<void> {
  try {
    const pending = await getPendingInvite();
    const res = await invitesApi.claim(pending?.token);
    if (res.joined.length > 0 || pending) await clearPendingInvite();
    const first = res.joined.find((j) => j.matchId);
    if (first?.matchId) useInviteLanding.getState().setMatch(first.matchId);
  } catch {
    // keep the pending invite so a later screen can try again
  }
}
