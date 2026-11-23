import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProfileBadge } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { badgeDetail } from '../badge-logic';
import { useBadgesQuery } from '../use-discovery';

/** All badges (design: Badges): the ones you earned in colour with the date, the rest locked with how to get them. */
export function BadgesScreen() {
  const { colors } = useTheme();
  const q = useBadgesQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const badges = q.data?.badges ?? [];
  const earned = badges.filter((b) => b.earnedAt).length;
  const open = badges.find((b) => b.slug === selected) ?? null;
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
                <Pressable
                  key={b.slug}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.name}. ${got ? 'Earned' : 'Not earned yet'}. Show details`}
                  onPress={() => setSelected(b.slug)}
                  style={[styles.card, { backgroundColor: colors.bg2, opacity: got ? 1 : 0.6 }]}
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
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
      {open ? <BadgeSheet badge={open} onClose={() => setSelected(null)} /> : null}
    </SafeAreaView>
  );
}

/** One badge up close (design: BadgeDetail): the tile, how you earn it, and whether you have. */
function BadgeSheet({ badge, onClose }: { badge: ProfileBadge; onClose: () => void }) {
  const { colors } = useTheme();
  const d = badgeDetail(badge);
  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close badge details"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel={`${badge.name} badge`}
        style={[styles.sheet, { backgroundColor: colors.card }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.line }]} />
        <View style={[styles.bigTile, { backgroundColor: d.unlocked ? badge.color : colors.chip }]}>
          <Text style={[styles.bigMark, { color: d.unlocked ? '#FFFFFF' : colors.sub }]}>
            {badge.mark}
          </Text>
        </View>
        <Text variant="title" style={styles.center} accessibilityRole="header">
          {badge.name}
        </Text>
        <View
          style={[styles.state, { backgroundColor: d.unlocked ? colors.moneySoft : colors.chip }]}
        >
          <Text variant="footnote" color={d.unlocked ? 'money' : 'sub'}>
            {d.status}
          </Text>
        </View>
        <Text variant="callout" style={styles.how}>
          How to get it
        </Text>
        <Text color="sub" style={styles.center}>
          {badge.description}
        </Text>
        <TokenButton label="Done" onPress={onClose} style={styles.done} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 16,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  bigTile: {
    width: 112,
    height: 112,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginVertical: 10,
  },
  bigMark: { fontSize: 38, fontFamily: 'Figtree_800ExtraBold' },
  center: { textAlign: 'center' },
  state: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  how: { marginTop: 8 },
  done: { alignSelf: 'stretch', marginTop: 12 },
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
