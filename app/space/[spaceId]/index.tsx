import { useLocalSearchParams } from 'expo-router';
import { SpaceScreen } from '@/features/spaces/screens/SpaceScreen';

export default function SpaceRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  return <SpaceScreen spaceId={spaceId} />;
}
