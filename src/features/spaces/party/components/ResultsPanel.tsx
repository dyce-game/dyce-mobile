import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatNaira, type LiveState, type SpaceView } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { myOutcomeLine, ordinal, resultLines, type NameOf } from '../common-logic';
import { ON, ON_DIM } from './PartyChrome';

/**
 * The end of the game, drawn over the table: how it ended (the screen's own story), then the standings
 * the server settled with each seat's payout. `live.results` only exists once the match is paid, so for
 * a moment after the last move the panel shows the story alone and says the results are on their way.
 */
export function ResultsPanel({
  space,
  live,
  myId,
  nameOf,
  title,
  sub,
  story,
  onContinue,
}: {
  space: Pick<SpaceView, 'members'>;
  live: Pick<LiveState, 'results' | 'mode'>;
  myId: string;
  nameOf: NameOf;
  title: string;
  sub?: string;
  /** Extra lines about how it went (the imposters, the word, the log). */
  story?: ReactNode;
  onContinue: () => void;
}) {
  const lines = resultLines(live.results);
  const mine = myOutcomeLine(lines, myId);
  const pool = live.mode === 'pool';
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Text
          variant="title"
          style={{ color: ON }}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {title}
        </Text>
        {sub ? <Text style={{ color: ON_DIM }}>{sub}</Text> : null}
        {mine ? (
          <Text variant="callout" style={{ color: '#FFD27A' }}>
            {mine}
          </Text>
        ) : null}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {story}
          {lines.length === 0 ? (
            <Text variant="footnote" style={{ color: ON_DIM }}>
              Settling the results…
            </Text>
          ) : (
            lines.map((l) => {
              const member = space.members.find((m) => m.userId === l.userId);
              const pay =
                pool && l.payoutKobo !== null && l.payoutKobo > 0
                  ? `+${formatNaira(l.payoutKobo)}`
                  : null;
              return (
                <View
                  key={l.userId}
                  accessible
                  accessibilityLabel={`${ordinal(l.placement)}, ${nameOf(l.userId)}, ${l.result}${
                    pay ? `, won ${formatNaira(l.payoutKobo ?? 0)} virtual Dyce Cash` : ''
                  }`}
                  style={styles.line}
                >
                  <Text variant="callout" style={[styles.place, { color: ON_DIM }]}>
                    {l.placement}
                  </Text>
                  <UserAvatar avatar={member?.avatar} name={nameOf(l.userId)} size={32} />
                  <Text variant="callout" numberOfLines={1} style={[styles.flex, { color: ON }]}>
                    {nameOf(l.userId)}
                  </Text>
                  <Text variant="footnote" style={{ color: pay ? '#3DDC84' : ON_DIM }}>
                    {pay ??
                      (l.result === 'forfeit'
                        ? 'Left'
                        : l.result === 'draw'
                          ? 'Draw'
                          : pool
                            ? '₦0'
                            : '')}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
        {pool ? (
          <Text variant="caption" style={{ color: ON_DIM }}>
            Dyce Cash is virtual
          </Text>
        ) : null}
        <TokenButton label="See results" tone="ember" onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', padding: 10 },
  card: {
    maxHeight: '78%',
    gap: 8,
    padding: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(18,10,6,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: '0px 10px 30px rgba(0,0,0,0.5)',
  },
  scroll: { flexGrow: 0 },
  scrollBody: { gap: 6, paddingVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  place: { width: 18, textAlign: 'center' },
});
