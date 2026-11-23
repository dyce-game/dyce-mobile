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
import { GameDetailBody } from '../components/GameDetailBody';
import { categoryChips, categoryLabel, filterGames, gameMeta } from '../games-logic';
import { GAME_NAMES, comingSoonSlugs, type GameSlug } from '../registry';
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
  const [pickedMode, setPickedMode] = useState<'free' | 'pool'>('free');
  // The rules sheet for a game (a drawer tile's "How to play", or a dev-only "coming soon" tile).
  const [rulesOf, setRulesOf] = useState<{
    slug: string;
    name: string;
    min?: number | null;
    /** The catalogue entry, when the game can be played (not for a dev-only "coming soon" tile). */
    game?: GameInfo;
  } | null>(null);

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
          initialMode={pickedMode}
          onBack={() => setPicked(null)}
        />
      </SheetFrame>
    );
  }

  if (rulesOf) {
    const g = rulesOf.game;
    const play = (mode: 'free' | 'pool') => {
      setPickedMode(mode);
      setPicked(g ?? null);
      setRulesOf(null);
    };
    return (
      <SheetFrame label={`${rulesOf.name} details`} onClose={close}>
        <GameDetailBody
          slug={rulesOf.slug}
          name={rulesOf.name}
          poolMinKobo={rulesOf.min}
          supportsPool={g?.supportsPool}
          onFree={g ? () => play('free') : undefined}
          onPool={g ? () => play('pool') : undefined}
          onBack={() => setRulesOf(null)}
        />
      </SheetFrame>
    );
  }

  const list = filterGames(games.data?.games ?? [], chip);
  const chips = categoryChips(games.data?.games ?? []);
  // Dev builds also list the games that have rules but no board yet, so the catalogue is visible while it
  // is being built. Production never does (the server hides a game until its board ships).
  const listed = new Set((games.data?.games ?? []).map((g) => g.slug));
  const soon: GameSlug[] = chip === 'all' ? comingSoonSlugs().filter((s) => !listed.has(s)) : [];

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
          <View
            key={g.slug}
            style={[styles.tile, { backgroundColor: colors.bg2, borderColor: colors.line }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${g.name}, ${gameMeta(g)}${g.supportsPool ? ', free or pool' : ', free play'}`}
              onPress={() => setPicked(g)}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${g.name} details and how to play`}
              onPress={() =>
                setRulesOf({ slug: g.slug, name: g.name, min: g.poolMinKobo, game: g })
              }
              style={styles.rulesLink}
            >
              <Text variant="footnote" color="accent">
                How to play
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {soon.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="callout">Coming soon (dev builds only)</Text>
          <View style={styles.grid}>
            {soon.map((slug) => (
              <Pressable
                key={slug}
                accessibilityRole="button"
                accessibilityLabel={`${GAME_NAMES[slug]}, coming soon. Show how to play.`}
                onPress={() => setRulesOf({ slug, name: GAME_NAMES[slug] })}
                style={[
                  styles.tile,
                  styles.soon,
                  { backgroundColor: colors.bg2, borderColor: colors.line },
                ]}
              >
                <GameArt slug={slug} style={styles.soonArt} />
                <View style={styles.tileBody}>
                  <Text variant="callout">{GAME_NAMES[slug]}</Text>
                  <Text variant="footnote" color="sub">
                    Coming soon
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
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
  rulesLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  soon: { opacity: 0.7 },
  soonArt: { height: 64 },
  flex: { flex: 1 },
  pickedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  pickedArt: { width: 52, height: 52, borderRadius: 14 },
});
