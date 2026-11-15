import { Redirect, Tabs, type Href } from 'expo-router';
import { hrefForStep } from '@/features/auth/routes';
import { useSession } from '@/features/auth/use-session';
import { AppTabBar } from '@/navigation/AppTabBar';

export default function TabsLayout() {
  const status = useSession((s) => s.status);
  const nextStep = useSession((s) => s.nextStep);

  // The app proper needs a finished account: anyone else is sent back into onboarding.
  if (status === 'signedOut') return <Redirect href={'/welcome' as Href} />;
  if (status === 'signedIn' && nextStep && nextStep !== 'done') {
    return <Redirect href={hrefForStep(nextStep) as Href} />;
  }

  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="spaces" />
      <Tabs.Screen name="wallet" />
    </Tabs>
  );
}
