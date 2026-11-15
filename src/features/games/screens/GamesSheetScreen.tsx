import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { GameInfo } from '@dyce/shared';
import { Chip, ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { newMessageId } from '@/features/chat/chat-logic';
import { useConversationQuery } from '@/features/chat/use-chat';
import { SheetFrame } from '@/features/wallet/components/SheetFrame';
import { GameArt } from '../components/GameArt';
import { categoryChips, categoryLabel, filterGames, gameMeta } from '../games-logic';
import { useCreateMatch, useGamesQuery } from '../use-games';

/**
 * The Games drawer and the mode sheet, one bottom sheet over the chat (design: Games, ModeSheet). Tap a
 * game, choose Free (Pool is shown as coming soon), and Send puts the game in the chat as a card.
 */
export function GamesSheetScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const conv = useConversationQuery(conversationId ?? '');
  const games = useGamesQuery();
  const create = useCreateMatch();
  const [chip, setChip] = useState('all');
  const [picked, setPicked] = useState<GameInfo | null>(null);
  // One id per attempt: tapping Send again after a network failure sends the same game, not a second one.
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const peer = conv.data?.peer;
  const name = peer?.displayName || peer?.username || 'your friend';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  function send(game: GameInfo) {
    if (!conversationId) return;
    const key = `${conversationId}:${game.slug}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: newMessageId() };
    create.mutate(
      { id: attempt.current.id, conversationId, gameSlug: game.slug },
      {
        onSuccess: () => {
          attempt.current = null;
          close();
        },
      },
    );
  }

  if (picked) {
    return (
      <SheetFrame label="Game mode" onClose={close}>
        <View style={styles.pickedHead}>
          <GameArt slug={picked.slug} dice={20} style={styles.pickedArt} />
          <View style={styles.flex}>
            <Text variant="headline" accessibilityRole="header">
              {picked.name} vs {name}
            </Text>
            <Text variant="footnote" color="sub">
              {gameMeta(picked)}
            </Text>
          </View>
          <UserAvatar avatar={peer?.avatar} name={name} size={40} />
        </View>

        <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Game mode">
          <View
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: true }}
            accessibilityLabel="Free. Bragging rights, XP and streaks. Your cash never moves."
            style={[styles.mode, { backgroundColor: colors.bg2, borderColor: colors.money }]}
          >
            <View>
              <ModeBadge kind="FREE" />
            </View>
            <Text variant="headline">Free</Text>
            <Text variant="footnote" color="sub">
              Bragging rights, XP and streaks. Your cash never moves.
            </Text>
          </View>
          <View
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: false, disabled: true }}
            accessibilityLabel="Pool. Coming soon."
            style={[
              styles.mode,
              styles.soon,
              { backgroundColor: colors.bg2, borderColor: colors.line },
            ]}
          >
            <View>
              <ModeBadge kind="POOL" />
            </View>
            <Text variant="headline" color="sub">
              Pool
            </Text>
            <Text variant="footnote" color="sub">
              Coming soon
            </Text>
          </View>
        </View>

        <TokenButton
          label={create.isPending ? 'Sending…' : `Send ${picked.name}`}
          accessibilityLabel={`Send ${picked.name} to ${name}`}
          disabled={create.isPending || !conversationId}
          onPress={() => send(picked)}
        />
        <TokenButton label="Back to games" tone="chip" onPress={() => setPicked(null)} />
        {create.isError ? (
          <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(create.error)}
          </Text>
        ) : null}
      </SheetFrame>
    );
  }

  const list = filterGames(games.data?.games ?? [], chip);
  const chips = categoryChips(games.data?.games ?? []);

  return (
    <SheetFrame label="Games" onClose={close}>
      <Text variant="title" accessibilityRole="header">
        Games
      </Text>
      {chips.length > 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((c) => (
            <Chip
              key={c}
              label={c === 'all' ? 'All' : categoryLabel(c)}
              selected={c === chip}
              onPress={() => setChip(c)}
            />
          ))}
        </ScrollView>
      ) : null}

      {games.isLoading ? <Text color="sub">Loading games…</Text> : null}
      {games.isError ? (
        <View style={styles.gap}>
          <Text color="accent">{authErrorMessage(games.error)}</Text>
          <TokenButton label="Try again" tone="chip" onPress={() => void games.refetch()} />
        </View>
      ) : null}
      {games.isSuccess && list.length === 0 ? <Text color="sub">No games here yet.</Text> : null}

      <View style={styles.grid}>
        {list.map((g) => (
          <Pressable
            key={g.slug}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${gameMeta(g)}, free play`}
            onPress={() => setPicked(g)}
            style={[styles.tile, { backgroundColor: colors.bg2, borderColor: colors.line }]}
          >
            <GameArt slug={g.slug} style={styles.tileArt} />
            <View style={styles.tileBody}>
              <Text variant="callout">{g.name}</Text>
              <Text variant="footnote" color="sub">
                {gameMeta(g)}
              </Text>
              <View style={styles.tags}>
                <ModeBadge kind="FREE" />
                {g.supportsPool ? <ModeBadge kind="POOL" /> : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 8 },
  chips: { gap: 8, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 6 },
  tile: { width: '47%', minWidth: 150, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  tileArt: { height: 104 },
  tileBody: { padding: 10, gap: 2 },
  tags: { flexDirection: 'row', gap: 4, marginTop: 6 },
  pickedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  pickedArt: { width: 52, height: 52, borderRadius: 14 },
  modes: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  mode: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2.5,
    padding: 14,
    gap: 6,
    alignItems: 'flex-start',
  },
  soon: { opacity: 0.6, borderWidth: 1.5 },
});
