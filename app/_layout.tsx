import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@dyce/ui';
import { useBootstrapSession } from '@/features/auth/use-session';
import { RealtimeBridge } from '@/features/chat/RealtimeBridge';
import { PushBridge } from '@/features/notifications/PushBridge';
import { PendingInviteRedirect } from '@/features/invites/PendingInviteRedirect';
import { AppProviders } from '@/providers/AppProviders';
import { hideSplash, useAppFonts } from '@/providers/fonts';

function ThemedStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ presentation: 'modal' }} />
        {/* Send and Request are bottom sheets over a dimmed screen (design: SendMoney, RequestMoney) */}
        <Stack.Screen
          name="wallet/send"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        {/* The Games drawer is a bottom sheet over the chat (design: Games, ModeSheet) */}
        <Stack.Screen
          name="games/index"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="wallet/request/index"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const sessionReady = useBootstrapSession();
  const ready = fontsReady && sessionReady;

  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  if (!ready) return null; // splash screen is still showing
  return (
    <AppProviders>
      <RealtimeBridge />
      <PushBridge />
      <PendingInviteRedirect />
      <ThemedStack />
    </AppProviders>
  );
}
