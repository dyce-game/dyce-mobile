import { Stack } from 'expo-router';
import { AppProviders } from '@/providers/AppProviders';
import { useAppFonts } from '@/providers/fonts';
import { useTheme } from '@dyce/ui';
import { StatusBar } from 'expo-status-bar';

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
  const ready = useAppFonts(); // holds the splash screen until fonts are loaded
  if (!ready) return null;
  return (
    <AppProviders>
      <ThemedStack />
    </AppProviders>
  );
}
