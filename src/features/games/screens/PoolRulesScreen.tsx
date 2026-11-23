import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import { EdgeFrame, EdgeTitle } from '@/features/account/components/EdgeFrame';
import { poolLimitLines, poolRules, poolUsageLine } from '../pool-rules-logic';
import { usePoolInfoQuery } from '../use-games';

const TONES = { ember: '#C93E1C', warn: '#C2410C', free: '#0E7C47' } as const;

/**
 * How pools work + limits (design: PoolRules), reached from the mode sheet, a game's details and Help. The
 * numbers are the ones the server enforces (`GET /games/pool`); the design's "Free-only mode" switch is not in
 * the SPEC, so it is not here (see docs/BACKLOG.md).
 */
export function PoolRulesScreen() {
  const { colors } = useTheme();
  const info = usePoolInfoQuery().data;
  const usage = poolUsageLine(info);
  return (
    <EdgeFrame backLabel="Back" fallback="/games">
      <EdgeTitle sub="Every game has both modes. You pick when you send it.">
        Free vs Pool
      </EdgeTitle>

      <View style={styles.modes}>
        <View style={[styles.mode, { backgroundColor: colors.moneySoft }]}>
          <Text variant="callout" color="money">
            Free
          </Text>
          <Text variant="footnote" style={styles.modeText}>
            XP, streaks, badges and the friends leaderboard. Unlimited. No cash moves.
          </Text>
        </View>
        <View style={[styles.mode, { backgroundColor: colors.brandSoft }]}>
          <Text variant="callout" color="accent">
            Pool
          </Text>
          <Text variant="footnote" style={styles.modeText}>
            Equal stakes in, winner takes the pot. Also earns XP. 18+ only.
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
        {poolRules(info).map((r, i, all) => (
          <View
            key={r.n}
            style={[
              styles.rule,
              { borderColor: colors.line, borderBottomWidth: i === all.length - 1 ? 0 : 1 },
            ]}
          >
            <View style={[styles.num, { backgroundColor: TONES[r.tone] }]}>
              <Text style={styles.numText}>{r.n}</Text>
            </View>
            <View style={styles.flex}>
              <Text variant="callout">{r.title}</Text>
              <Text variant="footnote" color="sub" style={styles.body}>
                {r.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text variant="footnote" color="sub" style={styles.label}>
        Your limits
      </Text>
      <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
        {poolLimitLines(info).map((line, i, all) => (
          <View
            key={line}
            style={[
              styles.limit,
              { borderColor: colors.line, borderBottomWidth: i === all.length - 1 ? 0 : 1 },
            ]}
          >
            <Text variant="callout">{line}</Text>
          </View>
        ))}
        {usage ? (
          <Text
            variant="footnote"
            color="sub"
            style={styles.usage}
            accessibilityLiveRegion="polite"
          >
            {usage}
          </Text>
        ) : null}
      </View>
    </EdgeFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mode: { flex: 1, borderRadius: 18, padding: 12, gap: 4 },
  modeText: { lineHeight: 18 },
  card: { borderRadius: 20, paddingHorizontal: 14 },
  rule: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  num: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  body: { lineHeight: 19, marginTop: 2 },
  label: { paddingHorizontal: 4, paddingTop: 18, paddingBottom: 6 },
  limit: { minHeight: 48, justifyContent: 'center' },
  usage: { paddingBottom: 12, lineHeight: 18 },
});
