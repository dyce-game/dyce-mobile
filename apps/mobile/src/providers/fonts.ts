import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';

// Keep the splash up until the root layout says fonts AND the session are ready.
void SplashScreen.preventAutoHideAsync();

/** Loads Figtree + Bricolage Grotesque. A font error must not brick the app, so an error counts as "ready". */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  return loaded || !!error;
}

export function hideSplash(): void {
  void SplashScreen.hideAsync();
}
