import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { GameInfo } from '@dyce/shared';
import { Chip, ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useConversationQuery } from '@/features/chat/use-chat';
import { SheetFrame } from '@/features/wallet/components/SheetFrame';
import { GameArt } from '../components/GameArt';
import { ModeSheetBody } from '../components/ModeSheetBody';
import { categoryChips, categoryLabel, filterGames, gameMeta } from '../games-logic';
import { useGamesQuery } from '../use-games';

/**
 * The Games drawer and the mode sheet, one bottom sheet over the chat (design: Games, ModeSheet). Tap a
 * game, choose Free or Pool (with a stake), and Send puts the game in the chat as a card.
 */
export function GamesSheetScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const conv = useConversationQuery(conversationId ?? '');
  const games = useGamesQuery();
  const [chip, setChip] = useState('all');
  const [picked, setPicked] = useState<GameInfo | null>(null);

  const peer = conv.data?.peer;
  const name = peer?.displayName || peer?.username || 'your friend';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  if (picked) {
    return (
      <SheetFrame label="Game mode" onClose={close}>
        <ModeSheetBody
          game={picked}
          conversationId={conversationId}
          peer={peer}
          name={name}
          onSent={close}
          onBack={() => setPicked(null)}
        />
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
            accessibilityLabel={`${g.name}, ${gameMeta(g)}${g.supportsPool ? ', free or pool' : ', free play'}`}
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
  gap: { gap: 8 },
  chips: { gap: 8, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 6 },
  tile: { width: '47%', minWidth: 150, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  tileArt: { height: 104 },
  tileBody: { padding: 10, gap: 2 },
  tags: { flexDirection: 'row', gap: 4, marginTop: 6 },
});
