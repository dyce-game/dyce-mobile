import { Redirect, useRouter, type Href } from 'expo-router';
import { Screen, Text, TokenButton } from '@dyce/ui';
import { authApi, sessionStore } from '@/lib/api';
import { useSession } from '@/features/auth/use-session';

// Dev-only: inspect the session and sign out. Real sign-out lives in Settings (later).
export default function SessionDebug() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.userId);
  const nextStep = useSession((s) => s.nextStep);
  if (!__DEV__) return <Redirect href={'/chat' as Href} />;

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Session
      </Text>
      <Text>status: {status}</Text>
      <Text>user: {userId ?? 'none'}</Text>
      <Text>next step: {nextStep ?? 'none'}</Text>
      <TokenButton
        label="Sign out"
        tone="chip"
        onPress={async () => {
          const refresh = sessionStore.getState().tokens?.refreshToken;
          if (refresh) await authApi.logout(refresh).catch(() => undefined);
          await sessionStore.getState().signOut();
          router.replace('/' as Href);
        }}
      />
    </Screen>
  );
}
