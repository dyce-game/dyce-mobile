import { useLocalSearchParams } from 'expo-router';
import { PollScreen } from '@/features/chat/screens/PollScreen';

export default function PollRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <PollScreen conversationId={conversationId} />;
}
