import { useLocalSearchParams } from 'expo-router';
import { ThreadScreen } from '@/features/chat/screens/ThreadScreen';

export default function ThreadRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ThreadScreen conversationId={conversationId} />;
}
