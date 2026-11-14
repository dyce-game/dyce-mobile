import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@dyce/ui';
import { useBootstrapSession } from '@/features/auth/use-session';
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
      <ThemedStack />
    </AppProviders>
  );
}
