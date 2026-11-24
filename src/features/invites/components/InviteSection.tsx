import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getLocales } from 'expo-localization';
import { Avatar, Text, TextField, useTheme } from '@dyce/ui';
import { sessionStore } from '@/lib/api';
import { PillButton } from '@/components/PillButton';
import { authErrorMessage } from '@/features/auth/messages';
import type { InvitableContact } from '@/features/contacts/sync';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { useSendInvite } from '../use-invites';

/** The game an invite is for. Word Hunt is the one a guest can play in a browser today (Cup Pong joins later). */
export const INVITE_GAME = 'word-hunt';

type RowState = { phase: 'idle' | 'sending' | 'sent'; error?: string };

/**
 * What the invited person receives, shown before anything is sent (Apple 5.1.2(v): say what the message is and who
 * appears to send it). Keep it in step with the text in dyce-backend apps/api/src/invites/invites.service.ts.
 */
export function invitePreview(senderName: string): string {
  return `${senderName} challenged you to Word Hunt on Dyce. Play in your browser, no app needed: dyce.games/i/…`;
}

/**
 * "Not on Dyce yet": people from your contacts you can text a game to (design: Invite, NewChat). The server
 * sends the SMS and never keeps the number. Also lets you type a number, for a browser or a missing contact.
 */
export function InviteSection({
  contacts,
  country,
  heading = 'Not on Dyce yet',
}: {
  contacts: InvitableContact[];
  /** ISO country used to read a typed national number ("0803…"). */
  country?: string;
  heading?: string;
}) {
  const { colors } = useTheme();
  const send = useSendInvite();
  const me = useMeQuery();
  const senderName = me.data?.profile?.displayName || me.data?.profile?.username || 'Your name';
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [typed, setTyped] = useState('');
  const [typedState, setTypedState] = useState<RowState>({ phase: 'idle' });

  const patch = (key: string, state: RowState) => setRows((r) => ({ ...r, [key]: state }));

  function invite(c: InvitableContact) {
    patch(c.key, { phase: 'sending' });
    send.mutate(
      { phone: c.e164, gameSlug: INVITE_GAME },
      {
        onSuccess: () => patch(c.key, { phase: 'sent' }),
        onError: (e) => patch(c.key, { phase: 'idle', error: authErrorMessage(e) }),
      },
    );
  }

  function inviteTyped() {
    if (typed.trim().length < 5) return;
    setTypedState({ phase: 'sending' });
    send.mutate(
      // Read at send time: the signed-in phone's country, else the device region (to read "0803…").
      {
        phone: typed.trim(),
        country:
          country ?? sessionStore.getState().country ?? getLocales()[0]?.regionCode ?? undefined,
        gameSlug: INVITE_GAME,
      },
      {
        onSuccess: () => {
          setTypedState({ phase: 'sent' });
          setTyped('');
        },
        onError: (e) => setTypedState({ phase: 'idle', error: authErrorMessage(e) }),
      },
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="sub" accessibilityRole="header">
        {heading}
      </Text>
      <Text variant="footnote" color="sub">
        Each invite is one text from Dyce, sent only when you tap Invite. They get: &quot;
        {invitePreview(senderName)}&quot; It does not come from your phone number.
      </Text>

      {contacts.map((c) => {
        const s = rows[c.key] ?? { phase: 'idle' };
        return (
          <View key={c.key} style={[styles.row, { borderColor: colors.line }]}>
            <Avatar name={c.name} size={44} />
            <View style={styles.names}>
              <Text variant="callout" numberOfLines={1}>
                {c.name}
              </Text>
              <Text variant="footnote" color={s.error ? 'accent' : 'sub'} numberOfLines={2}>
                {s.error ??
                  (s.phase === 'sent' ? 'Invite sent by text' : 'Not on Dyce · text message')}
              </Text>
            </View>
            <PillButton
              label={s.phase === 'sent' ? 'Invited' : 'Invite to play'}
              tone="primary"
              busy={s.phase === 'sending'}
              disabled={s.phase === 'sent'}
              accessibilityLabel={
                s.phase === 'sent' ? `${c.name} was invited` : `Invite ${c.name} to play`
              }
              onPress={() => invite(c)}
            />
          </View>
        );
      })}

      <View style={styles.typed}>
        <TextField
          label="Invite by phone number"
          hint={
            typedState.phase === 'sent'
              ? 'Invite sent by text.'
              : "We text them a link. They can play in the browser, no app needed. We don't keep the number."
          }
          value={typed}
          onChangeText={(t) => {
            setTyped(t);
            if (typedState.phase !== 'sending') setTypedState({ phase: 'idle' });
          }}
          placeholder="0803 412 7781"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          error={typedState.error}
          returnKeyType="send"
          onSubmitEditing={inviteTyped}
        />
        <PillButton
          label="Send invite"
          tone="primary"
          busy={typedState.phase === 'sending'}
          disabled={typed.trim().length < 5}
          accessibilityLabel="Send an invite by text to this number"
          onPress={inviteTyped}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  names: { flex: 1, minWidth: 0 },
  typed: { gap: 10, marginTop: 8, alignItems: 'flex-start' },
});
