import { useLocalSearchParams } from 'expo-router';
import { PoolIssueScreen } from '@/features/games/screens/PoolIssueScreen';

export default function PoolIssueRoute() {
  const { matchId, kind } = useLocalSearchParams<{ matchId: string; kind?: string }>();
  return <PoolIssueScreen matchId={matchId} kind={kind === 'limit' ? 'limit' : 'low-balance'} />;
}
