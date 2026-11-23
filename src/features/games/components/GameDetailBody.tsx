import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { poolRulesLine, rulesFor } from '../registry';
import { GameArt } from './GameArt';
import { RulesSheet } from './RulesSheet';

type Tab = 'how' | 'modes';

/**
 * A game's detail sheet (design: GameDetail): the picture and name, "How to play" and "Free & Pool" tabs from the
 * registry's rules copy (docs/GAMES.md), and the two ways to start: Play free, or Start a pool. The design's record
 * and friends tabs need stats the server doesn't report per game yet, so they are not here (docs/BACKLOG.md). A game
 * that can't be played yet (a dev-only "coming soon" tile) shows the rules without the buttons.
 */
export function GameDetailBody({
  slug,
  name,
  poolMinKobo,
  supportsPool,
  onFree,
  onPool,
  onBack,
}: {
  slug: string;
  name: string;
  poolMinKobo?: number | null;
  /** Whether Pool is offered for this game; undefined hides the pool button with the rest of the CTAs. */
  supportsPool?: boolean;
  /** Absent for a game that can't be played yet. */
  onFree?: () => void;
  onPool?: () => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('how');
  const rules = rulesFor(slug);
  const playable = !!onFree;

  return (
    <>
      <View style={styles.head}>
        <GameArt slug={slug} dice={20} style={styles.art} />
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {name}
          </Text>
        </View>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['how', 'How to play'],
            ['modes', 'Free & Pool'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={[styles.tab, { backgroundColor: tab === id ? colors.ink : colors.chip }]}
          >
            <Text variant="callout" color={tab === id ? colors.inkText : colors.text}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'how' ? (
        <RulesSheet slug={slug} poolMinKobo={poolMinKobo} showPool={false} />
      ) : (
        <View style={styles.modes}>
          <View style={[styles.mode, { backgroundColor: colors.moneySoft }]}>
            <Text variant="callout" color="money">
              Free
            </Text>
            <Text variant="footnote" style={styles.modeText}>
              No Dyce Cash moves. You earn XP: 25 for a win, 10 for playing, 5 for your first game
              of the day. Wins on consecutive days build a streak.
            </Text>
          </View>
          <View style={[styles.mode, { backgroundColor: colors.brandSoft }]}>
            <Text variant="callout" color="accent">
              Pool
            </Text>
            <Text variant="footnote" style={styles.modeText}>
              {rules && rules.poolMinKobo !== null
                ? poolRulesLine(rules, poolMinKobo)
                : 'Pool isn’t available for this game.'}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="How Pool works"
              onPress={() => router.push('/pool-rules' as Href)}
              style={styles.link}
            >
              <Text variant="footnote" color="accent">
                How Pool works
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {playable ? (
        <View style={styles.cta}>
          <TokenButton label="Play free" tone="felt" onPress={onFree} style={styles.flex} />
          {supportsPool && onPool ? (
            <TokenButton label="Start a pool" onPress={onPool} style={styles.flex} />
          ) : null}
        </View>
      ) : null}
      <TokenButton label="Back to games" tone="chip" onPress={onBack} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 56, height: 56, borderRadius: 14 },
  tabs: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  modes: { gap: 10 },
  mode: { borderRadius: 18, padding: 14, gap: 4 },
  modeText: { lineHeight: 19 },
  link: { minHeight: 44, justifyContent: 'center' },
  cta: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
