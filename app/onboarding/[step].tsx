import { useLocalSearchParams } from 'expo-router';
import { OnboardingStepScreen } from '@/features/auth/screens/OnboardingStepScreen';
import { ContactsScreen } from '@/features/contacts/screens/ContactsScreen';

export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  if (step === 'contacts') return <ContactsScreen />;
  return <OnboardingStepScreen step={step ?? ''} />;
}
