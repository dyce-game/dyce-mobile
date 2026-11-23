import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { SpaceView } from '@dyce/shared';
import { ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { TabHeader } from '@/features/shell/TabHeader';
import { STATUS_LABEL, modeLine, spaceMeta } from '../spaces-logic';
import { useSpacesQuery } from '../use-spaces';

const CARD_BG: Record<SpaceView['status'], string> = {
  waiting: '#2E2823',
  live: '#C93E1C',
  ended: '#4A423A',
  closed: '#4A423A',
};

/**
 * The Spaces tab (design: Space): join with a code, and your spaces: the ones waiting for players, the ones
 * live right now and the ones that just finished. "+" opens Create a space. Public spaces ("Open now"),
 * and the People switch come later (docs/BACKLOG.md). Quick match with a stranger opens from the card
 * below the code row.
 */
export function SpacesTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useSpacesQuery();
  const spaces = query.data?.spaces ?? [];
  const live = spaces.filter((s) => s.status === 'live').length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
    >
      <TabHeader title="Spaces" onPlus={() => router.push('/space/new' as Href)} />
      {live > 0 ? (
        <View style={styles.playing} accessibilityLiveRegion="polite">
          <View style={styles.dot} />
          <Text variant="footnote" color="sub">
            {live} live now
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick match, play someone new at your level"
        onPress={() => router.push('/quick-match' as Href)}
        style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <View style={styles.flex}>
          <Text variant="callout">Quick match</Text>
          <Text variant="footnote" color="sub">
            Play someone new at your level
          </Text>
        </View>
        <ModeBadge kind="SPACE" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Join a space with a code"
        onPress={() => router.push('/space/join' as Href)}
        style={[styles.join, { borderColor: colors.line }]}
      >
        <Text variant="callout" style={styles.flex}>
          Join a space with a code
        </Text>
        <Text variant="footnote" color="sub" style={styles.codeHint}>
          DY-····
        </Text>
      </Pressable>

      <Text variant="headline" accessibilityRole="header" style={styles.section}>
        Your spaces
      </Text>

      {query.isLoading ? null : spaces.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="headline">No spaces yet</Text>
          <Text color="sub">
            Open a space for your friends, free or for Dyce Cash: Whot!, Crazy Cards, Imposter,
            Werewolf, Charades or Doodle Guess. Then share the code.
          </Text>
          <TokenButton label="Create a space" onPress={() => router.push('/space/new' as Href)} />
        </View>
      ) : (
        <View style={styles.list}>
          {spaces.map((s) => (
            <SpaceCard
              key={s.id}
              space={s}
              onPress={() =>
                router.push(
                  (s.status === 'ended' ? `/space/${s.id}/result` : `/space/${s.id}`) as Href,
                )
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SpaceCard({ space, onPress }: { space: SpaceView; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${space.name}, ${spaceMeta(space)}, ${STATUS_LABEL[space.status].toLowerCase()}, ${modeLine(space)}`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: CARD_BG[space.status] }]}
    >
      <View style={styles.cardTop}>
        <ModeBadge kind={space.mode === 'pool' ? 'POOL' : 'FREE'} />
        <Text style={styles.status}>{STATUS_LABEL[space.status]}</Text>
      </View>
      <Text style={styles.cardName} numberOfLines={1}>
        {space.name}
      </Text>
      <Text style={styles.cardMeta}>{spaceMeta(space)}</Text>
      <View style={styles.faces}>
        {space.members.map((m) => (
          <View key={m.userId} style={styles.face}>
            <UserAvatar avatar={m.avatar} name={m.displayName || m.username} size={30} />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 140 },
  playing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2BB673' },
  join: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  codeHint: { letterSpacing: 1 },
  quick: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  section: { marginTop: 6 },
  empty: { gap: 8, paddingTop: 4 },
  list: { gap: 12 },
  card: { minHeight: 150, borderRadius: 24, padding: 14, gap: 6, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { color: '#fff', fontSize: 12, fontFamily: 'Figtree_800ExtraBold' },
  cardName: { color: '#fff', fontSize: 21, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  cardMeta: { color: '#fff', opacity: 0.9, fontSize: 12, fontFamily: 'Figtree_500Medium' },
  faces: { flexDirection: 'row', marginTop: 'auto' },
  face: {
    marginRight: -10,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
});
