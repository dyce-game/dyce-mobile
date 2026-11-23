import { useLocalSearchParams } from 'expo-router';
import { AddMembersScreen } from '@/features/chat/screens/AddMembersScreen';

export default function AddMembersRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <AddMembersScreen conversationId={conversationId} />;
}
