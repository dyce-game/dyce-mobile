import { useLocalSearchParams } from 'expo-router';
import { LegalScreen } from '@/features/account/screens/LegalScreen';

export default function LegalRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  return <LegalScreen doc={doc} />;
}
