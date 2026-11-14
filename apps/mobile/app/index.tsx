import { Redirect, type Href } from 'expo-router';
import { hrefForStep } from '@/features/auth/routes';
import { useSession } from '@/features/auth/use-session';

// The front door: signed-out users go to Welcome, signed-in users resume at their onboarding step
// (or the app, when onboarding is done).
export default function Index() {
  const status = useSession((s) => s.status);
  const nextStep = useSession((s) => s.nextStep);
  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href={'/welcome' as Href} />;
  return <Redirect href={hrefForStep(nextStep) as Href} />;
}
