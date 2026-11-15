import { useLocalSearchParams } from 'expo-router';
import { ChatInfoScreen } from '@/features/safety/screens/ChatInfoScreen';

export default function ChatInfoRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ChatInfoScreen conversationId={conversationId} />;
}
