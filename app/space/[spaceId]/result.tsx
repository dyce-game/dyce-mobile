import { useLocalSearchParams } from 'expo-router';
import { SpaceResultScreen } from '@/features/spaces/screens/SpaceResultScreen';

export default function SpaceResultRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  return <SpaceResultScreen spaceId={spaceId} />;
}
