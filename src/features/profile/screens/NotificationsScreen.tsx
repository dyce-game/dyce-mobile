import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeNotification, type NotificationFilter, type NotificationItem } from '@dyce/shared';
import { Icon, Text, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import {
  actorName,
  groupByDay,
  kindTag,
  timeAgo,
} from '@/features/notifications/notifications-logic';
import {
  useMarkRead,
  useNotificationsQuery,
  useUnreadCount,
} from '@/features/notifications/use-notifications';

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'turn', label: 'Your turn' },
  { key: 'pool', label: 'Pools' },
];

type Row = { type: 'head'; label: string } | { type: 'item'; item: NotificationItem };

/**
 * Notifications (design: Activity), reached from your profile: filters, Today / Earlier, an avatar with a kind tag,
 * the text, a button where there is something to do, and an unread dot. Fed by real events; "Mark all read" clears
 * the count on the bell and on your avatar.
 */
export function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const q = useNotificationsQuery(filter);
  const markRead = useMarkRead();
  const unread = useUnreadCount();

  const rows = useMemo<Row[]>(() => {
    const items = q.data?.pages.flatMap((p) => p.items) ?? [];
    return groupByDay(items, new Date()).flatMap((g) => [
      { type: 'head' as const, label: g.label },
      ...g.items.map((item) => ({ type: 'item' as const, item })),
    ]);
  }, [q.data]);

  const open = (item: NotificationItem) => {
    if (!item.read) markRead.mutate({ ids: [item.id] });
    const text = describeNotification(item.kind, item.payload, actorName(item.actor));
    router.push(text.route as Href);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as Href));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={back}
          style={styles.back}
        >
          <Icon name="back" size={24} color={colors.accent} strokeWidth={2.4} />
          <Text style={[styles.backText, { color: colors.accent }]}>Profile</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all read"
          accessibilityState={{ disabled: unread === 0 }}
          disabled={unread === 0 || markRead.isPending}
          onPress={() => markRead.mutate({ all: true })}
          style={styles.markAll}
        >
          <Text style={[styles.markAllText, { color: unread === 0 ? colors.sub : colors.accent }]}>
            Mark all read
          </Text>
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Notifications
      </Text>
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="tab"
              accessibilityLabel={f.label}
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.key)}
              style={[styles.filter, { backgroundColor: on ? colors.ink : colors.chip }]}
            >
              <Text style={[styles.filterText, { color: on ? colors.inkText : colors.text }]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : q.isError ? (
        <View style={styles.empty}>
          <Text color="sub" style={styles.body}>
            {authErrorMessage(q.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void q.refetch()}
            style={[styles.retry, { backgroundColor: colors.chip }]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.tile, { backgroundColor: brand.ember.fill }]} aria-hidden>
            <Icon name="bell" size={30} color={brand.ember.text} />
          </View>
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            You&apos;re all caught up
          </Text>
          <Text color="sub" style={styles.body}>
            Your turn, game invites and money you receive will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.type === 'head' ? `h:${r.label}` : r.item.id)}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          renderItem={({ item: r }) =>
            r.type === 'head' ? (
              <Text style={[styles.group, { color: colors.sub }]} accessibilityRole="header">
                {r.label}
              </Text>
            ) : (
              <NotificationRow item={r.item} onOpen={() => open(r.item)} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const { colors } = useTheme();
  const who = actorName(item.actor);
  const text = describeNotification(item.kind, item.payload, who);
  const tag = kindTag(item.kind);
  const when = timeAgo(item.createdAt, new Date());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text.title}. ${text.body} ${when}${item.read ? '' : ', unread'}`}
      onPress={onOpen}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <View>
        <UserAvatar avatar={item.actor?.avatar} name={who ?? 'Dyce'} size={44} />
        <View
          style={[styles.tag, { backgroundColor: tag.color, borderColor: colors.bg }]}
          aria-hidden
        >
          <Text style={styles.tagText}>{tag.mark}</Text>
        </View>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{text.title}</Text>
        <Text style={styles.rowText} color="sub">
          {text.body}
        </Text>
        <Text style={styles.rowTime} color="sub">
          {when}
        </Text>
        {text.cta ? (
          <View
            style={[styles.cta, { backgroundColor: item.read ? colors.chip : brand.ember.fill }]}
          >
            <Text style={[styles.ctaText, { color: item.read ? colors.text : brand.ember.text }]}>
              {text.cta}
            </Text>
          </View>
        ) : null}
      </View>
      {item.read ? null : <View style={styles.dot} aria-hidden />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  markAll: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  markAllText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  title: {
    fontSize: 34,
    letterSpacing: -0.6,
    paddingHorizontal: 16,
    marginBottom: 10,
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  group: { fontSize: 13, fontFamily: 'Figtree_700Bold', paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, minHeight: 64 },
  tag: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Figtree_800ExtraBold' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Figtree_700Bold' },
  rowText: { fontSize: 14, lineHeight: 19 },
  rowTime: { fontSize: 12, marginTop: 2 },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
  },
  ctaText: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#C93E1C', marginTop: 6 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 70, gap: 8 },
  tile: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 24, fontFamily: 'BricolageGrotesque_700Bold', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
  retry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center' },
  retryText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
});
