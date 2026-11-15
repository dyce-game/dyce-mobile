import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * Notifications (design: Notifications), reached from your profile. Nothing creates notifications yet (push and
 * the in-app list arrive together), so this says so instead of showing sample rows.
 */
export function NotificationsScreen() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.pad}>
        <ScreenHeader title="Notifications" fallback="/profile" />
      </View>
      <View style={styles.empty}>
        <View style={[styles.tile, { backgroundColor: brand.ember.fill }]} aria-hidden>
          <Icon name="bell" size={30} color={brand.ember.text} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          You&apos;re all caught up
        </Text>
        <Text color="sub" style={styles.body}>
          Your turn, game invites and money you receive will show up here.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 80, gap: 8 },
  tile: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 24, fontFamily: 'BricolageGrotesque_700Bold', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
});
