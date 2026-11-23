import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { MatchView } from '@dyce/shared';
import { ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { canResign, reportOpponentHref, resignCopy } from '../games-edge-logic';
import { opponentOf } from '../games-logic';
import { useResignMatch } from '../use-games';
import { FlagGlyph, GameStateCard } from './GameStateCard';
import { RulesSheet } from './RulesSheet';

/**
 * The in-game menu (design: GameMenu, GameForfeit): how to play this game, report the opponent, and resign with the
 * Pool consequence stated before anything happens. Opened from the host's header. Resigning asks once more on a card
 * that says what it costs; the result screen takes over when the server has finished the match. Mute and sound
 * switches from the design are not here: there is no chat mute or game sound setting to switch yet (BACKLOG).
 */
export function GameMenuSheet({
  match,
  myId,
  oppName,
  onClose,
}: {
  match: MatchView;
  myId: string | null;
  oppName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const resign = useResignMatch();
  const [view, setView] = useState<'menu' | 'rules' | 'resign'>('menu');
  const opponent = opponentOf(match, myId);
  const report = reportOpponentHref(match, myId);
  const cost = resignCopy(match, oppName);
  const mayResign = canResign(match, myId);

  if (view === 'resign') {
    return (
      <GameStateCard
        tone="danger"
        center={<FlagGlyph color="#E0453A" />}
        title={cost.title}
        body={cost.body}
        chip={cost.chip}
        primary={{
          label: resign.isPending ? 'Resigning…' : cost.confirm,
          busy: resign.isPending,
          onPress: () => resign.mutate(match.id, { onSuccess: onClose }),
        }}
        secondary={{ label: 'Keep playing', onPress: onClose }}
        error={resign.isError ? authErrorMessage(resign.error) : null}
      />
    );
  }

  const rows: {
    key: string;
    label: string;
    value?: string;
    danger?: boolean;
    onPress: () => void;
  }[] = [{ key: 'rules', label: `How to play ${match.gameName}`, onPress: () => setView('rules') }];
  if (report) {
    rows.push({
      key: 'report',
      label: `Report ${oppName}`,
      onPress: () => {
        onClose();
        router.push(report as Href);
      },
    });
  }
  if (mayResign) {
    rows.push({
      key: 'resign',
      label: cost.menuLabel,
      danger: true,
      onPress: () => setView('resign'),
    });
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel="Game menu"
        style={[styles.sheet, { backgroundColor: colors.card }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.line }]} />
        <View style={styles.head}>
          {opponent ? <UserAvatar avatar={opponent.avatar} name={oppName} size={40} /> : null}
          <View style={styles.flex}>
            <Text variant="headline" accessibilityRole="header">
              {match.gameName}
            </Text>
            <Text variant="footnote" color="sub">
              {`Playing ${oppName}`}
            </Text>
          </View>
          <ModeBadge kind={match.mode === 'pool' ? 'POOL' : 'FREE'} />
        </View>

        {view === 'rules' ? (
          <ScrollView style={styles.rules}>
            <RulesSheet slug={match.gameSlug} />
            {match.mode === 'pool' ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="How Pool works"
                onPress={() => {
                  onClose();
                  router.push('/pool-rules' as Href);
                }}
                style={styles.link}
              >
                <Text variant="callout" color="accent">
                  How Pool works
                </Text>
              </Pressable>
            ) : null}
            <TokenButton label="Back" tone="chip" onPress={() => setView('menu')} />
          </ScrollView>
        ) : (
          <>
            <View style={[styles.list, { backgroundColor: colors.bg2 }]}>
              {rows.map((r, i) => (
                <Pressable
                  key={r.key}
                  accessibilityRole="button"
                  accessibilityLabel={r.label}
                  onPress={r.onPress}
                  style={[
                    styles.row,
                    { borderColor: colors.line, borderBottomWidth: i === rows.length - 1 ? 0 : 1 },
                  ]}
                >
                  <Text
                    variant="callout"
                    color={r.danger ? colors.danger : colors.text}
                    style={styles.flex}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TokenButton label="Back to the game" onPress={onClose} style={styles.back} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(5,8,7,0.62)',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: '86%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  list: { marginTop: 14, borderRadius: 18, overflow: 'hidden' },
  row: { minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  back: { marginTop: 12 },
  rules: { marginTop: 14 },
  link: { minHeight: 44, justifyContent: 'center' },
});
