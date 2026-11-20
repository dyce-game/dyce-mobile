import { useLocalSearchParams } from 'expo-router';
import { GuestGameScreen } from '@/features/invites/screens/GuestGameScreen';

/** The guest round, no account needed. */
export default function InvitePlayRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <GuestGameScreen token={token} />;
}
