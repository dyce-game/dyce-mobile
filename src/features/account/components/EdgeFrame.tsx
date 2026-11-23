import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, useTheme } from '@dyce/ui';

/**
 * The frame of the plain full screens in Settings and its neighbours (Help, Delete account, Pool rules, Dispute):
 * a Back link top-left (to where you came from, or to `fallback`), then a scrolling body on the page background.
 * `footer` sits under the scroll area (a primary button).
 */
export function EdgeFrame({
  backLabel = 'Back',
  fallback = '/settings',
  grouped = false,
  children,
  footer,
}: {
  backLabel?: string;
  fallback?: string;
  /** Sand page behind white cards (Settings style) instead of the plain page. */
  grouped?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const back = () => (router.canGoBack() ? router.back() : router.replace(fallback as Href));
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: grouped ? colors.grouped : colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
          onPress={back}
          style={styles.back}
        >
          <Icon name="back" size={24} color={colors.accent} strokeWidth={2.4} />
          <Text style={[styles.backText, { color: colors.accent }]}>{backLabel}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** The big page title of these screens. */
export function EdgeTitle({ children, sub }: { children: string; sub?: string }) {
  return (
    <View style={styles.titleBox}>
      <Text variant="title" accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {sub ? (
        <Text color="sub" style={styles.sub}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  back: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  titleBox: { gap: 6, marginTop: 6, marginBottom: 14 },
  title: { fontSize: 30, letterSpacing: -0.5 },
  sub: { fontSize: 15, lineHeight: 22 },
});
