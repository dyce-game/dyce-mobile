import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { InviteLandingScreen } from '@/features/invites/screens/InviteLandingScreen';
import { NativeInviteGate } from '@/features/invites/screens/NativeInviteGate';

/** https://dyce.games/i/<token>: the landing page in a browser; sign-up (or the game) inside the app. */
export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return Platform.OS === 'web' ? (
    <InviteLandingScreen token={token} />
  ) : (
    <NativeInviteGate token={token} />
  );
}
