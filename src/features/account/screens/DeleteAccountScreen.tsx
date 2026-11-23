import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { unregisterDevice } from '@/features/notifications/push';
import { sessionStore } from '@/lib/api';
import { EdgeFrame, EdgeTitle } from '../components/EdgeFrame';
import { deletionConfirmed, deletionRows, longDateTime, openGamesNote } from '../account-logic';
import { useCancelDeletion, useDeletionQuery, useRequestDeletion } from '../use-account';

const TONES = { ember: '#B33416', money: '#0E7C47', warn: '#C2410C', blue: '#2457D6' } as const;

/**
 * Delete account (design: DeleteAccount; SPEC section 12). Says what happens (the username is released, the Dyce
 * Cash balance is cleared with nothing paid out, the games stay anonymised), asks for the username as the
 * confirmation, then starts a 30 day grace period and signs you out. Signing in again before the date cancels it.
 * If a request is already waiting, the screen shows the date and a way to keep the account.
 */
export function DeleteAccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const client = useQueryClient();
  const query = useDeletionQuery();
  const request = useRequestDeletion();
  const cancel = useCancelDeletion();
  const [typed, setTyped] = useState('');

  const data = query.data;
  const pending = data?.status.pending ?? false;
  const ready = !!data && deletionConfirmed(typed, data.preview.username);

  async function leave() {
    await unregisterDevice(); // stop pushing to this phone before the session goes
    client.clear();
    await sessionStore.getState().signOut();
    router.replace('/welcome' as Href);
  }

  const footer = !data ? null : pending ? (
    <TokenButton
      label={cancel.isPending ? 'Keeping your account…' : 'Keep my account'}
      disabled={cancel.isPending}
      onPress={() => cancel.mutate()}
    />
  ) : (
    <>
      <TokenButton
        label={request.isPending ? 'Deleting…' : 'Delete account'}
        tone="ember"
        disabled={!ready || request.isPending}
        accessibilityLabel={
          ready ? 'Delete account' : 'Delete account, type your username above to unlock'
        }
        onPress={() => request.mutate(typed, { onSuccess: () => void leave() })}
        style={{ opacity: ready ? 1 : 0.45 }}
      />
    </>
  );

  return (
    <EdgeFrame backLabel="Settings" footer={footer}>
      <EdgeTitle
        sub={
          pending && data?.status.executeAfter
            ? `Your account will be erased on ${longDateTime(data.status.executeAfter)}. Sign in before then and nothing is lost.`
            : `You have ${data?.preview.graceDays ?? 30} days to change your mind. Sign in again before then and everything comes back.`
        }
      >
        Delete your account
      </EdgeTitle>

      {query.isPending ? (
        <ActivityIndicator color={colors.sub} style={styles.wait} />
      ) : query.isError || !data ? (
        <View style={styles.wait}>
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(query.error)}
          </Text>
          <TokenButton label="Try again" tone="chip" onPress={() => void query.refetch()} />
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
            {deletionRows(data.preview).map((r, i, all) => (
              <View
                key={r.title}
                style={[
                  styles.row,
                  { borderColor: colors.line, borderBottomWidth: i === all.length - 1 ? 0 : 1 },
                ]}
              >
                <View style={[styles.mark, { backgroundColor: TONES[r.tone] }]}>
                  <Text style={styles.markText}>{r.mark}</Text>
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

          {openGamesNote(data.preview) ? (
            <View style={[styles.note, { backgroundColor: '#FFF1E0' }]}>
              <Text variant="footnote" color="#5A2E00" style={styles.noteText}>
                {openGamesNote(data.preview)}
              </Text>
            </View>
          ) : null}

          {pending ? null : (
            <>
              <Text variant="footnote" color="sub" style={styles.label}>
                Type your username to confirm
              </Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder={data.preview.username}
                placeholderTextColor={colors.sub}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Type your username to confirm"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: ready ? colors.danger : colors.line,
                    backgroundColor: colors.bg,
                  },
                ]}
              />
            </>
          )}
          {request.isError || cancel.isError ? (
            <Text color="accent" style={styles.error} accessibilityLiveRegion="polite">
              {authErrorMessage(request.error ?? cancel.error)}
            </Text>
          ) : null}
        </>
      )}
    </EdgeFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wait: { paddingVertical: 24, gap: 12, alignItems: 'center' },
  card: { borderRadius: 18, paddingHorizontal: 14 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  mark: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontSize: 12, fontFamily: 'Figtree_800ExtraBold' },
  body: { lineHeight: 18, marginTop: 2 },
  note: { marginTop: 12, borderRadius: 16, padding: 12 },
  noteText: { lineHeight: 19 },
  label: { marginTop: 18, marginBottom: 8 },
  input: {
    minHeight: 54,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 17,
    fontFamily: 'Figtree_600SemiBold',
  },
  error: { marginTop: 10 },
});
