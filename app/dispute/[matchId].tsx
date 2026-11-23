import { useLocalSearchParams } from 'expo-router';
import { DisputeScreen } from '@/features/games/screens/DisputeScreen';

export default function DisputeRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <DisputeScreen matchId={matchId} />;
}
