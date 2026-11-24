import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { images } from '@/assets';
import { useAuthMethods } from '../use-auth-methods';

/**
 * First screen for signed-out users. A code to your phone or your email is the way in (no passwords, no social
 * login in v1). Signing up and logging in are the same flow for each, so "Get started" and "Log in" lead to the
 * phone screen and "Sign up with email" and "Log in with email" to the email screen. The email options hide when the
 * server has email sign-in switched off.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const methods = useAuthMethods();
  const go = () => router.push('/phone' as Href);
  const goEmail = (mode: 'signup' | 'login') => router.push(`/email?mode=${mode}` as Href);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.hero, { backgroundColor: colors.brandSoft }]}>
        <Image
          source={images.welcomeHero}
          style={styles.heroImage}
          resizeMode="contain"
          accessibilityLabel="A friendly Dyce player waving"
        />
      </View>

      <View style={styles.copy}>
        <View style={styles.brandRow}>
          <View style={[styles.mark, { backgroundColor: brand.ember.fill }]} aria-hidden />
          <Text variant="title">dyce</Text>
        </View>
        <Text variant="title" accessibilityRole="header" style={styles.headline}>
          Game night lives in your chats.
        </Text>
        <Text color="sub">Send a game like a text. Play anyone, iPhone or Android.</Text>
      </View>

      <View style={styles.actions}>
        <TokenButton label="Get started" onPress={go} />
        {methods.email ? (
          <TokenButton
            label="Sign up with email"
            tone="chip"
            accessibilityLabel="Sign up using email"
            onPress={() => goEmail('signup')}
          />
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Log in"
          onPress={go}
          style={styles.login}
        >
          <Text color="sub">
            On Dyce already?{' '}
            <Text color="accent" variant="callout">
              Log in
            </Text>
          </Text>
        </Pressable>
        {methods.email ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Log in with email"
            onPress={() => goEmail('login')}
            style={styles.login}
          >
            <Text color="accent" variant="callout">
              Log in with email
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  hero: {
    marginTop: 16,
    borderRadius: 36,
    height: 340,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroImage: { width: '86%', height: '96%' },
  copy: { paddingTop: 28, gap: 10, paddingHorizontal: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 32, height: 32, borderRadius: 10 },
  headline: { lineHeight: 34 },
  actions: { marginTop: 'auto', gap: 8, paddingBottom: 12 },
  login: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
