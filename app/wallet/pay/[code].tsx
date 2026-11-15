import { useLocalSearchParams } from 'expo-router';
import { PayScreen } from '@/features/wallet/screens/PayScreen';

export default function PayRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <PayScreen code={code.toUpperCase()} />;
}
