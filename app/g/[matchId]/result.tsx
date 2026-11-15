import { useLocalSearchParams } from 'expo-router';
import { GameResultScreen } from '@/features/games/screens/GameResultScreen';

export default function GameResultRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <GameResultScreen matchId={matchId} />;
}
