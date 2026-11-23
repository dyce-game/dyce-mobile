import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SPACE_CODE_LENGTH, formatNaira, normalizeSpaceCode } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { SpaceProblemView } from '../components/SpaceProblemView';
import { problemForJoinError } from '../space-problem-logic';
import { modeLine, spaceMeta, visibilityLabel } from '../spaces-logic';
import { useJoinSpace, useSpaceLookup } from '../use-spaces';

/**
 * Join a space with a code (design: JoinRoom): type DY-XXXX (the "DY-" is already there), see "Space found"
 * with who is seated and what it costs, then sit down. In Pool the seat fee is taken when you sit down.
 * A code from a link (/s/DY-4K9P) arrives pre-filled.
 */
export function JoinSpaceScreen({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const join = useJoinSpace();

  useEffect(() => {
    const c = initialCode ? normalizeSpaceCode(initialCode) : null;
    if (c) setText(c.slice(3));
  }, [initialCode]);

  const body = text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SPACE_CODE_LENGTH);
  const code = normalizeSpaceCode(body.length === SPACE_CODE_LENGTH ? `DY-${body}` : '');
  const lookup = useSpaceLookup(code);
  const found = lookup.data;
  const lookupFailed = lookup.isError ? lookup.error : null;

  function sitDown() {
    if (!code) return;
    join.mutate(code, {
      onSuccess: (space) => router.replace(`/space/${space.id}` as Href),
    });
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/spaces' as Href));
  const alreadyIn = found?.seated ?? false;
  const problem = join.isError ? join.error : lookupFailed;
  // The space filled up while you were typing, or you were removed from it: a screen of its own (design: RoomFull, RoomRemoved).
  const edge =
    problem instanceof ApiError ? problemForJoinError(problem.code, problem.details) : null;
  if (edge) {
    const name =
      problem instanceof ApiError && typeof problem.details.name === 'string'
        ? problem.details.name
        : null;
    return (
      <SpaceProblemView
        problem={edge}
        title={name}
        onPrimary={() => router.replace('/spaces' as Href)}
        onSecondary={() => join.reset()}
        secondaryLabel="Try another code"
      />
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={back}
          style={styles.side}
        >
          <Text color="accent" style={styles.cancel}>
            Cancel
          </Text>
        </Pressable>
        <Text variant="callout" accessibilityRole="header">
          Join a space
        </Text>
        <View style={styles.side} />
      </View>

      <View style={styles.body}>
        <Text variant="title" accessibilityRole="header">
          Enter the space code
        </Text>
        <Text color="sub">The host can find it in the space. It looks like DY-4K9P.</Text>

        <View style={styles.codeRow}>
          <Text style={[styles.prefix, { color: colors.sub }]}>DY-</Text>
          <TextInput
            accessibilityLabel="Space code, four characters after DY-"
            value={body}
            onChangeText={(t) => {
              join.reset();
              setText(
                t
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, SPACE_CODE_LENGTH),
              );
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={SPACE_CODE_LENGTH}
            placeholder="4K9P"
            placeholderTextColor={colors.sub}
            returnKeyType="go"
            onSubmitEditing={sitDown}
            style={[
              styles.input,
              {
                backgroundColor: colors.chip,
                color: colors.text,
                borderColor: code ? '#C93E1C' : 'transparent',
              },
            ]}
          />
        </View>

        {found ? (
          <View style={styles.found} accessible accessibilityLabel={`Space found: ${found.name}`}>
            <Text variant="caption" style={styles.foundTag}>
              Space found
            </Text>
            <Text style={styles.foundName}>{found.name}</Text>
            <Text style={styles.foundMeta}>
              {spaceMeta(found)} · host{' '}
              {found.members.find((m) => m.isHost)?.displayName ?? 'the host'}
            </Text>
            <View style={styles.faces}>
              {found.members.map((m) => (
                <View key={m.userId} style={styles.face}>
                  <UserAvatar avatar={m.avatar} name={m.displayName || m.username} size={38} />
                </View>
              ))}
            </View>
            <View style={styles.foundMode}>
              <Text style={styles.foundModeText}>
                {modeLine(found)}
                {found.mode === 'pool'
                  ? ` · winner pot up to ${formatNaira(found.seatFeeKobo * found.maxSeats)}`
                  : ''}
              </Text>
            </View>
            <Text style={styles.foundMeta}>{visibilityLabel(found.visibility)}</Text>
          </View>
        ) : null}

        {problem ? (
          <View style={styles.problem} accessibilityRole="alert">
            <Text variant="headline">{problemTitle(problem)}</Text>
            <Text color="sub">{authErrorMessage(problem)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TokenButton
          label={
            join.isPending
              ? 'Joining…'
              : alreadyIn
                ? 'Open space'
                : found?.mode === 'pool'
                  ? `Join · pay ${formatNaira(found.seatFeeKobo)}`
                  : 'Join space'
          }
          disabled={!found || join.isPending || (found.status !== 'waiting' && !alreadyIn)}
          onPress={() => (alreadyIn ? router.replace(`/space/${found!.id}` as Href) : sitDown())}
        />
      </View>
    </SafeAreaView>
  );
}

function problemTitle(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  switch (code) {
    case 'space_full':
      return 'This space is full';
    case 'space_not_open':
      return 'This space has started';
    case 'space_not_found':
      return "We couldn't find that space";
    case 'insufficient_funds':
      return 'Not enough Dyce Cash';
    default:
      return "You can't join this space";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  side: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { fontSize: 17 },
  body: { flex: 1, padding: 20, gap: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  prefix: { fontSize: 26, fontFamily: 'Figtree_800ExtraBold' },
  input: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 16,
    fontSize: 28,
    letterSpacing: 6,
    fontFamily: 'Figtree_800ExtraBold',
  },
  found: { borderRadius: 22, padding: 16, backgroundColor: '#B23A12', gap: 4, marginTop: 10 },
  foundTag: { color: '#fff', opacity: 0.9 },
  foundName: { color: '#fff', fontSize: 22, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  foundMeta: { color: '#fff', opacity: 0.95, fontSize: 14, fontFamily: 'Figtree_500Medium' },
  faces: { flexDirection: 'row', marginTop: 8 },
  face: {
    marginRight: -10,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  foundMode: {
    marginTop: 12,
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  foundModeText: { color: '#fff', fontSize: 13, fontFamily: 'Figtree_700Bold' },
  problem: { gap: 4, paddingTop: 8 },
  footer: { padding: 16 },
});
