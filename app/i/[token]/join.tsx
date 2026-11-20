import { useLocalSearchParams } from 'expo-router';
import { InviteJoinScreen } from '@/features/invites/screens/InviteJoinScreen';

/** Sign up from an invite: the number is prefilled and the game waits after onboarding. */
export default function InviteJoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InviteJoinScreen token={token} />;
}
