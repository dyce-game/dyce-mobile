import { useLocalSearchParams } from 'expo-router';
import { GroupInfoScreen } from '@/features/chat/screens/GroupInfoScreen';

export default function GroupInfoRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <GroupInfoScreen conversationId={conversationId} />;
}
