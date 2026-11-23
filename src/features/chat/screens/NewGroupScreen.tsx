import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_GROUP_MEMBERS, MAX_GROUP_TITLE_LENGTH, MIN_GROUP_OTHERS } from '@dyce/shared';
import { Icon, MAX_FONT_SCALE, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useFriendsQuery } from '@/features/friends/use-friends';
import { newMessageId } from '../chat-logic';
import { FriendPicker } from '../components/FriendPicker';
import { useCreateGroup } from '../use-chat';

/**
 * New group (design: NewGroup): a name, a placeholder photo, and the friends to put in it. You can only add
 * friends, so nobody lands in a group (and in their Chat) because a stranger put them there. A group needs
 * at least two other people; you are its admin. Group photos are a placeholder until uploads exist, so the
 * circle is not a button.
 */
export function NewGroupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriendsQuery();
  const create = useCreateGroup();
  // one id per form: a retried Create (a lost response) returns the same group, not a second one
  const groupId = useRef(newMessageId());
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const name = title.trim();
  const enough = selected.length >= MIN_GROUP_OTHERS;
  const ready = name.length > 0 && enough && selected.length < MAX_GROUP_MEMBERS;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = () => {
    if (!ready || create.isPending) return;
    create.mutate(
      { id: groupId.current, title: name, memberIds: selected },
      { onSuccess: (g) => router.replace(`/c/${g.id}` as Href) },
    );
  };

  const cancel = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));
  const list = friends.data?.friends ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={cancel}
          style={styles.barSide}
        >
          <Text style={[styles.barText, { color: colors.accent }]}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.barTitle}>
          New group
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create group"
          accessibilityState={{ disabled: !ready || create.isPending }}
          disabled={!ready || create.isPending}
          onPress={submit}
          style={[styles.barSide, styles.barRight]}
        >
          <Text
            style={[styles.barText, styles.create, { color: ready ? colors.accent : colors.sub }]}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.nameRow}>
          <View aria-hidden style={[styles.photo, { backgroundColor: colors.brandSoft }]}>
            <Icon name="friends" size={26} color={colors.accent} />
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Group name"
            placeholderTextColor={colors.sub}
            accessibilityLabel="Group name"
            maxLength={MAX_GROUP_TITLE_LENGTH}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            returnKeyType="done"
            style={[styles.nameInput, { color: colors.text, borderColor: brand.ember.fill }]}
          />
        </View>

        {!enough ? (
          <Text variant="footnote" color="sub">
            Pick at least {MIN_GROUP_OTHERS} friends ({selected.length} so far). Only your friends
            can be added.
          </Text>
        ) : null}

        {friends.isLoading ? <Text color="sub">Loading your friends…</Text> : null}
        {friends.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(friends.error)}</Text>
            <TokenButton label="Try again" tone="chip" onPress={() => void friends.refetch()} />
          </View>
        ) : null}
        {friends.isSuccess ? (
          <FriendPicker
            friends={list}
            selected={selected}
            onToggle={toggle}
            query={query}
            onQuery={setQuery}
            empty="You haven't added any friends yet. Add friends first, then make a group."
          />
        ) : null}
        {friends.isSuccess && list.length === 0 ? (
          <TokenButton
            label="Add friends"
            tone="chip"
            onPress={() => router.push('/friends/add' as Href)}
          />
        ) : null}

        {create.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(create.error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  barSide: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  barRight: { alignItems: 'flex-end' },
  barText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  create: { fontFamily: 'Figtree_700Bold' },
  barTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    flex: 1,
    minHeight: 48,
    borderBottomWidth: 2,
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
  },
  block: { gap: 12 },
});
