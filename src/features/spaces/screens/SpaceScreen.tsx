import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type SpaceView } from '@dyce/shared';
import { Icon, ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { reportHref } from '@/features/safety/safety-logic';
import { PARTY_RESULT_DELAY_MS, hasPartyScreen } from '../party/common-logic';
import { isLudoRoom } from '../tables/ludo-table-logic';
import { SpaceProblemView } from '../components/SpaceProblemView';
import { problemForSpace } from '../space-problem-logic';
import { lobbyAction, modeLine, visibilityLabel } from '../spaces-logic';
import {
  useCloseSpace,
  useLeaveSpace,
  useRemoveMember,
  useSpaceQuery,
  useStartSpace,
} from '../use-spaces';
import { isCardGame } from '../tables/model';
import { TableScreen } from './TableScreen';

/**
 * Route space/[spaceId]: the one place a space lives. Waiting shows the lobby (design: Lobby), live shows
 * the table, finished moves on to the results, closed says so. The server's view of the space decides which.
 */
export function SpaceScreen({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useSpaceQuery(spaceId);
  const space = query.data;

  // A party game ends on a reveal people read (the imposters, the roles, the word), and a card game on the
  // table's results panel (every hand turned over): the table stays up for a while after the space ends, and
  // its own "See results" button moves on sooner.
  const party =
    !!space &&
    (hasPartyScreen(space.gameSlug) || isCardGame(space.gameSlug) || isLudoRoom(space.gameSlug));
  useEffect(() => {
    if (space?.status !== 'ended') return;
    const to = () => router.replace(`/space/${spaceId}/result` as Href);
    if (!party) return to();
    const id = setTimeout(to, PARTY_RESULT_DELAY_MS);
    return () => clearTimeout(id);
  }, [space?.status, party, spaceId, router]);

  const toSpaces = () => router.replace('/spaces' as Href);

  if (!space) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
        {query.isError ? (
          <>
            <Text variant="headline">
              {gone ? "This space isn't there" : "Couldn't open this space"}
            </Text>
            <Text color="sub" style={styles.text}>
              {gone ? 'It may have been closed, or you left it.' : authErrorMessage(query.error)}
            </Text>
            <TokenButton label="Back to spaces" onPress={toSpaces} />
          </>
        ) : (
          <ActivityIndicator />
        )}
      </SafeAreaView>
    );
  }

  if ((space.status === 'live' || (space.status === 'ended' && party)) && space.seated)
    return <TableScreen space={space} />;

  // Out of a space you were in (design: RoomHostLeft, RoomRemoved): the server says why, and what became of your seat fee.
  const problem = problemForSpace(space);
  if (problem) {
    const again = problem.kind === 'host_closed' || problem.kind === 'expired';
    return (
      <SpaceProblemView
        problem={problem}
        title={space.name}
        onPrimary={() => (again ? router.replace('/space/new' as Href) : toSpaces())}
        onSecondary={again ? toSpaces : undefined}
        secondaryLabel="Back to spaces"
      />
    );
  }

  return <Lobby space={space} />;
}

function Lobby({ space }: { space: SpaceView }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const start = useStartSpace();
  const leave = useLeaveSpace();
  const close = useCloseSpace();
  const remove = useRemoveMember();
  const action = lobbyAction(space);
  const empty = Math.max(0, space.maxSeats - space.members.length);
  const toSpaces = () => router.replace('/spaces' as Href);
  const failure = [start, leave, close, remove].find((m) => m.isError)?.error;

  async function share() {
    const message = `Join my ${space.gameName} space on Dyce: ${space.code}\nhttps://dyce.games/s/${space.code}`;
    try {
      if (Platform.OS === 'web') {
        await (
          globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }
        ).navigator?.clipboard?.writeText(message);
      } else {
        await Share.share({ message });
      }
    } catch {
      // the person closed the share sheet
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to spaces"
          onPress={toSpaces}
          style={styles.side}
        >
          <Icon name="back" color={colors.text} />
        </Pressable>
        <View style={styles.titleBox}>
          <Text variant="callout" numberOfLines={1} accessibilityRole="header">
            {space.name}
          </Text>
          <Text variant="footnote" color="sub">
            {visibilityLabel(space.visibility)}
            {space.hosting ? " · you're the host" : ''}
          </Text>
        </View>
        <View style={styles.side} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroMark}>
          <Text style={styles.heroMarkText}>W</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.heroTitle}>{space.gameName}</Text>
          <Text style={styles.heroMeta}>
            {space.maxSeats} seats
            {space.mode === 'pool' ? ` · ${formatNaira(space.seatFeeKobo)} entry` : ''}
          </Text>
          <View style={styles.heroPills}>
            <ModeBadge kind={space.mode === 'pool' ? 'POOL' : 'FREE'} />
            {space.mode === 'pool' ? (
              <View style={styles.pot}>
                <Text style={styles.potText}>Pot {formatNaira(space.potKobo)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <Text variant="footnote" color="sub" style={styles.modeLine}>
        {modeLine(space)}
      </Text>

      <View style={[styles.code, { backgroundColor: colors.bg2 }]}>
        <View style={styles.flex}>
          <Text variant="footnote" color="sub">
            Space code
          </Text>
          <Text
            accessibilityLabel={`Space code ${space.code.split('').join(' ')}`}
            style={[styles.codeText, { color: colors.text }]}
          >
            {space.code}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share the space code and link"
          onPress={() => void share()}
          style={[styles.shareBtn, { backgroundColor: colors.brandSoft }]}
        >
          <Text color="accent" variant="callout">
            Share link
          </Text>
        </Pressable>
      </View>

      <View style={styles.seats}>
        {space.members.map((m) => {
          const name = m.userId === myId ? 'You' : m.displayName || m.username;
          const canRemove = space.hosting && m.userId !== myId;
          return (
            <View
              key={m.userId}
              style={[
                styles.seat,
                { backgroundColor: colors.bg2, borderColor: m.isHost ? '#C93E1C' : 'transparent' },
              ]}
            >
              <UserAvatar avatar={m.avatar} name={name} size={56} />
              <Text variant="callout" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="footnote" style={{ color: colors.money }}>
                {m.isHost ? 'Host · Ready' : 'Ready'}
                {space.mode === 'pool' && m.stakedKobo > 0 ? ' · Paid' : ''}
              </Text>
              {m.userId !== myId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Report or block ${name}`}
                  onPress={() =>
                    router.push(
                      reportHref({
                        userId: m.userId,
                        username: m.username,
                        name: m.displayName,
                      }) as Href,
                    )
                  }
                  style={styles.removeBtn}
                >
                  <Text variant="footnote" color="sub">
                    Report
                  </Text>
                </Pressable>
              ) : null}
              {canRemove ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${name} from the space`}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate({ id: space.id, userId: m.userId })}
                  style={styles.removeBtn}
                >
                  <Text variant="footnote" color="sub">
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <View
            key={`empty-${i}`}
            accessible
            accessibilityLabel="Open seat"
            style={[styles.seat, { backgroundColor: colors.bg2, borderColor: 'transparent' }]}
          >
            <View style={[styles.openDot, { borderColor: colors.line }]}>
              <Icon name="plus" size={22} color={colors.sub} />
            </View>
            <Text variant="callout" color="sub">
              Open seat
            </Text>
            <Text variant="footnote" color="sub">
              Share the code
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.flex} />

      {failure ? (
        <Text
          variant="footnote"
          style={[styles.error, { color: colors.danger }]}
          accessibilityRole="alert"
        >
          {authErrorMessage(failure)}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <TokenButton
          label={start.isPending ? 'Starting…' : action.label}
          disabled={!action.enabled || start.isPending}
          onPress={() => start.mutate(space.id)}
        />
        {action.hint ? (
          <Text variant="footnote" color="sub" style={styles.hint}>
            {action.hint}
          </Text>
        ) : null}
        <View style={styles.links}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              space.mode === 'pool' ? 'Leave the space and take your entry back' : 'Leave the space'
            }
            disabled={leave.isPending}
            onPress={() => leave.mutate(space.id, { onSuccess: toSpaces })}
            style={styles.link}
          >
            <Text color="accent" variant="callout">
              Leave space
            </Text>
          </Pressable>
          {space.hosting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the space for everyone"
              disabled={close.isPending}
              onPress={() => close.mutate(space.id, { onSuccess: toSpaces })}
              style={styles.link}
            >
              <Text style={{ color: colors.danger }} variant="callout">
                Close space
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  text: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8 },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, alignItems: 'center' },
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#B23A12',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#8C2A43',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMarkText: { color: '#fff', fontSize: 28, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  heroTitle: { color: '#fff', fontSize: 20, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  heroMeta: { color: '#fff', opacity: 0.95, fontSize: 13, fontFamily: 'Figtree_500Medium' },
  heroPills: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  pot: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  potText: { color: '#fff', fontSize: 13, fontFamily: 'Figtree_700Bold' },
  modeLine: { marginHorizontal: 20, marginTop: 6 },
  code: {
    marginHorizontal: 16,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  codeText: { fontSize: 20, letterSpacing: 2, fontFamily: 'Figtree_800ExtraBold' },
  shareBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16, marginTop: 14 },
  seat: {
    width: '48%',
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  removeBtn: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  openDot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { textAlign: 'center', paddingHorizontal: 16 },
  footer: { padding: 16, gap: 6 },
  hint: { textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  link: { minHeight: 44, justifyContent: 'center' },
});
