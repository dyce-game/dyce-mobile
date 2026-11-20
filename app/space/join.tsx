import { useLocalSearchParams } from 'expo-router';
import { JoinSpaceScreen } from '@/features/spaces/screens/JoinSpaceScreen';

export default function JoinSpaceRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <JoinSpaceScreen initialCode={code} />;
}
