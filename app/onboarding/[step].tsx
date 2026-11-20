import { useLocalSearchParams } from 'expo-router';
import { OnboardingStepScreen } from '@/features/auth/screens/OnboardingStepScreen';
import { NotifPermissionScreen } from '@/features/notifications/NotifPermissionScreen';
import { ContactsScreen } from '@/features/contacts/screens/ContactsScreen';

export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  if (step === 'contacts') return <ContactsScreen />;
  if (step === 'notifications') return <NotifPermissionScreen />;
  return <OnboardingStepScreen step={step ?? ''} />;
}
