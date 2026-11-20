import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeSpaceCode, type PersonResult } from '@dyce/shared';
import { Icon, Text, TextField, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useDebounced } from '@/features/auth/use-debounced';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useConversationsQuery } from '@/features/chat/use-chat';
import { useGamesQuery } from '@/features/games/use-games';
import { useSpaceLookup, useSpacesQuery } from '@/features/spaces/use-spaces';
import { useHistoryQuery } from '@/features/wallet/use-wallet';
import { secureStorage } from '@/lib/storage';
import {
  addRecent,
  filterChats,
  filterGames,
  filterHistory,
  filterSpaces,
  parseRecents,
  placeholderFor,
  scopeFrom,
} from '../search-logic';
import { usePeopleSearch } from '../use-discovery';

const RECENTS_KEY = 'dyce.recent-searches';

/**
 * Search (designs SpaceSearch, SearchRecent, SearchEmpty), scoped to the tab you came from. People come from the
 * server (friends by name or @username from 2 characters; strangers by @username from 3). Chats, games, your
 * spaces and transactions are filtered on the phone from what is already loaded. A Space code (DY-4K9P) is looked
 * up exactly. Recent searches are kept on this phone only.
 */
export function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
  const scope = scopeFrom(rawScope);
  const [text, setText] = useState('');
  const q = useDebounced(text.trim().replace(/^@/, '').toLowerCase(), 250);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    void secureStorage.getItem(RECENTS_KEY).then((raw) => setRecents(parseRecents(raw)));
  }, []);
  const remember = (term: string) => {
    const next = addRecent(recents, term);
    setRecents(next);
    void secureStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  };
  const clearRecents = () => {
    setRecents([]);
    void secureStorage.removeItem(RECENTS_KEY);
  };

  const people = usePeopleSearch(q);
  const chats = useConversationsQuery('all');
  const games = useGamesQuery();
  const mySpaces = useSpacesQuery();
  const history = useHistoryQuery('all');
  const code = normalizeSpaceCode(text);
  const spaceByCode = useSpaceLookup(scope === 'spaces' || scope === 'chat' ? code : null);

  const chatHits = useMemo(
    () => (scope === 'chat' ? filterChats(chats.data?.conversations ?? [], q) : []),
    [scope, chats.data, q],
  );
  const gameHits = useMemo(
    () => (scope === 'wallet' ? [] : filterGames(games.data?.games ?? [], q)),
    [scope, games.data, q],
  );
  const spaceHits = useMemo(
    () => (scope === 'spaces' ? filterSpaces(mySpaces.data?.spaces ?? [], q) : []),
    [scope, mySpaces.data, q],
  );
  const txnHits = useMemo(
    () =>
      scope === 'wallet' ? filterHistory(history.data?.pages.flatMap((p) => p.items) ?? [], q) : [],
    [scope, history.data, q],
  );

  const searching = q.length >= 2;
  const peopleList = people.data?.people ?? [];
  const foundSpace = spaceByCode.data && !spaceByCode.isError ? spaceByCode.data : null;
  const nothing =
    searching &&
    !people.isFetching &&
    peopleList.length === 0 &&
    chatHits.length === 0 &&
    gameHits.length === 0 &&
    spaceHits.length === 0 &&
    txnHits.length === 0 &&
    !foundSpace;

  const go = (href: string, term?: string) => {
    remember(term ?? text);
    router.push(href as Href);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <View style={styles.field}>
          <TextField
            label="Search"
            value={text}
            onChangeText={setText}
            placeholder={placeholderFor(scope)}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            leading={<Icon name="search" size={20} color={colors.sub} />}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close search"
          onPress={close}
          style={styles.cancel}
        >
          <Text style={{ color: colors.accent, fontFamily: 'Figtree_600SemiBold', fontSize: 16 }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!searching ? (
          recents.length === 0 ? (
            <Text color="sub" style={styles.hint}>
              Find friends by name or @username, and games, spaces and transactions.
            </Text>
          ) : (
            <Section title="Recent" action={{ label: 'Clear', onPress: clearRecents }}>
              {recents.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${r}`}
                  onPress={() => setText(r)}
                  style={[styles.row, { borderColor: colors.line }]}
                >
                  <Icon name="history" size={20} color={colors.sub} />
                  <Text style={styles.rowTitle}>{r}</Text>
                </Pressable>
              ))}
            </Section>
          )
        ) : null}

        {foundSpace ? (
          <Section title="Space found">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open space ${foundSpace.name}, code ${foundSpace.code}`}
              onPress={() => go(`/s/${foundSpace.code}`, foundSpace.code)}
              style={[styles.row, { borderColor: colors.line }]}
            >
              <Icon name="planet" size={22} color={colors.accent} />
              <View style={styles.body}>
                <Text style={styles.rowTitle}>{foundSpace.name}</Text>
                <Text color="sub" style={styles.rowSub}>
                  {foundSpace.gameName} · {foundSpace.code}
                </Text>
              </View>
            </Pressable>
          </Section>
        ) : null}

        {searching && (people.isFetching || peopleList.length > 0 || people.isError) ? (
          <Section title="People">
            {people.isError ? (
              <Text color="accent" style={styles.hint} accessibilityLiveRegion="polite">
                {authErrorMessage(people.error)}
              </Text>
            ) : peopleList.length === 0 ? (
              <Text color="sub" style={styles.hint}>
                Searching…
              </Text>
            ) : (
              peopleList.map((p) => (
                <PersonRowResult key={p.id} person={p} onOpen={() => go(`/u/${p.username}`, q)} />
              ))
            )}
          </Section>
        ) : null}

        {chatHits.length > 0 ? (
          <Section title="Chats">
            {chatHits.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${c.peer.displayName || c.peer.username}`}
                onPress={() => go(`/c/${c.id}`, q)}
                style={[styles.row, { borderColor: colors.line }]}
              >
                <UserAvatar
                  avatar={c.peer.avatar}
                  name={c.peer.displayName || c.peer.username}
                  size={40}
                />
                <View style={styles.body}>
                  <Text style={styles.rowTitle}>{c.peer.displayName || c.peer.username}</Text>
                  {c.lastMessage?.body ? (
                    <Text color="sub" style={styles.rowSub} numberOfLines={1}>
                      {c.lastMessage.body}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Section>
        ) : null}

        {gameHits.length > 0 ? (
          <Section title="Games">
            {gameHits.map((g) => (
              <Pressable
                key={g.slug}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}. Pick a friend to play it with`}
                onPress={() => go('/c/new', q)}
                style={[styles.row, { borderColor: colors.line }]}
              >
                <Icon name="chat" size={20} color={colors.accent} />
                <View style={styles.body}>
                  <Text style={styles.rowTitle}>{g.name}</Text>
                  <Text color="sub" style={styles.rowSub}>
                    {g.supportsPool ? 'Free or Pool' : 'Free'} · Pick a friend to play
                  </Text>
                </View>
              </Pressable>
            ))}
          </Section>
        ) : null}

        {spaceHits.length > 0 ? (
          <Section title="Your spaces">
            {spaceHits.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`Open space ${s.name}`}
                onPress={() => go(`/space/${s.id}`, q)}
                style={[styles.row, { borderColor: colors.line }]}
              >
                <Icon name="planet" size={20} color={colors.accent} />
                <View style={styles.body}>
                  <Text style={styles.rowTitle}>{s.name}</Text>
                  <Text color="sub" style={styles.rowSub}>
                    {s.gameName} · {s.code}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Section>
        ) : null}

        {txnHits.length > 0 ? (
          <Section title="Transactions">
            {txnHits.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Open receipt ${t.note || t.counterparty?.username || ''}`}
                onPress={() => go(`/wallet/receipt/${t.id}`, q)}
                style={[styles.row, { borderColor: colors.line }]}
              >
                <Icon name="history" size={20} color={colors.accent} />
                <View style={styles.body}>
                  <Text style={styles.rowTitle}>
                    {t.counterparty ? `@${t.counterparty.username}` : 'Dyce'}
                  </Text>
                  <Text color="sub" style={styles.rowSub} numberOfLines={1}>
                    {t.note || t.kind}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Section>
        ) : null}

        {nothing ? (
          <View style={styles.empty} accessibilityLiveRegion="polite">
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              No results for &ldquo;{text.trim()}&rdquo;
            </Text>
            <Text color="sub" style={styles.hint}>
              Check the spelling. To find someone you don&apos;t know yet, type the start of their
              @username (3 or more letters).
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonRowResult({ person, onOpen }: { person: PersonResult; onOpen: () => void }) {
  const { colors } = useTheme();
  const tag =
    person.source === 'friend'
      ? 'Friend'
      : person.mutualFriends > 0
        ? `${person.mutualFriends} mutual`
        : person.source === 'stranger'
          ? 'Not in your contacts'
          : 'You know them';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName || person.username}, @${person.username}, ${tag}`}
      onPress={onOpen}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <UserAvatar avatar={person.avatar} name={person.displayName || person.username} size={44} />
      <View style={styles.body}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {person.displayName || person.username}
        </Text>
        <Text color="sub" style={styles.rowSub} numberOfLines={1}>
          @{person.username} · Level {person.level}
        </Text>
      </View>
      <Text color="sub" style={styles.tag}>
        {tag}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} color="sub" accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action.label} ${title.toLowerCase()}`}
            onPress={action.onPress}
            style={styles.sectionAction}
          >
            <Text style={{ color: colors.accent, fontFamily: 'Figtree_600SemiBold', fontSize: 14 }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  field: { flex: 1 },
  cancel: { minHeight: 56, minWidth: 56, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  section: { paddingTop: 8 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontFamily: 'Figtree_700Bold', paddingVertical: 6 },
  sectionAction: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1 },
  body: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontFamily: 'Figtree_600SemiBold' },
  rowSub: { fontSize: 13 },
  tag: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  empty: { paddingTop: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 20, fontFamily: 'BricolageGrotesque_700Bold', textAlign: 'center' },
});
