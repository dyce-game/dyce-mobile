import { useLocalSearchParams } from 'expo-router';
import { RequestDetailScreen } from '@/features/wallet/screens/RequestDetailScreen';

export default function RequestDetailRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <RequestDetailScreen code={code} />;
}
