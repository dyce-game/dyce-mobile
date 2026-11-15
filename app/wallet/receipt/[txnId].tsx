import { useLocalSearchParams } from 'expo-router';
import { ReceiptScreen } from '@/features/wallet/screens/ReceiptScreen';

export default function ReceiptRoute() {
  const { txnId } = useLocalSearchParams<{ txnId: string }>();
  return <ReceiptScreen txnId={txnId} />;
}
