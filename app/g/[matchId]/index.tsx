import { useLocalSearchParams } from 'expo-router';
import { GameHostScreen } from '@/features/games/screens/GameHostScreen';

export default function GameRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <GameHostScreen matchId={matchId} />;
}
