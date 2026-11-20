import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { useBadgesQuery } from '../use-discovery';

/** All badges (design: Badges): the ones you earned in colour with the date, the rest locked with how to get them. */
export function BadgesScreen() {
  const { colors } = useTheme();
  const q = useBadgesQuery();
  const badges = q.data?.badges ?? [];
  const earned = badges.filter((b) => b.earnedAt).length;
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.pad}>
        <ScreenHeader title="Badges" fallback="/profile" />
      </View>
      {q.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : q.isError ? (
        <Text color="accent" style={styles.note}>
          {authErrorMessage(q.error)}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text color="sub" style={styles.note}>
            {earned} of {badges.length} earned
          </Text>
          <View style={styles.grid}>
            {badges.map((b) => {
              const got = !!b.earnedAt;
              return (
                <View
                  key={b.slug}
                  style={[styles.card, { backgroundColor: colors.bg2, opacity: got ? 1 : 0.6 }]}
                  accessible
                  accessibilityLabel={`${b.name}. ${b.description} ${got ? `Earned ${new Date(b.earnedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not earned yet'}`}
                >
                  <View style={[styles.tile, { backgroundColor: got ? b.color : colors.chip }]}>
                    <Text style={[styles.mark, { color: got ? '#FFFFFF' : colors.sub }]}>
                      {b.mark}
                    </Text>
                  </View>
                  <Text style={styles.name}>{b.name}</Text>
                  <Text color="sub" style={styles.desc}>
                    {b.description}
                  </Text>
                  <Text style={[styles.status, { color: got ? colors.money : colors.sub }]}>
                    {got
                      ? `Earned ${new Date(b.earnedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : 'Locked'}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 12 },
  loading: { marginTop: 40 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  note: { fontSize: 14, paddingVertical: 8, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', borderRadius: 20, padding: 14, gap: 4, alignItems: 'center' },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginBottom: 6,
  },
  mark: { fontSize: 22, fontFamily: 'Figtree_800ExtraBold' },
  name: { fontSize: 15, fontFamily: 'Figtree_700Bold', textAlign: 'center' },
  desc: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  status: { fontSize: 12, fontFamily: 'Figtree_700Bold', marginTop: 4 },
});
