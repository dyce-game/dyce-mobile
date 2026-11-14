import { useLocalSearchParams } from 'expo-router';
import { OnboardingStepScreen } from '@/features/auth/screens/OnboardingStepScreen';

export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  return <OnboardingStepScreen step={step ?? ''} />;
}
