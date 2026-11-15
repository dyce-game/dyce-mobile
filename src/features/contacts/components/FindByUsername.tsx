import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { usernameSchema, type PublicUser } from '@dyce/shared';
import { Text, TextField, TokenButton } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { contactsApi } from '@/lib/api';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { PersonRow } from './PersonRow';

/**
 * Exact username search ("Find by username"). Works with or without contacts permission, so it is also
 * the way in for people who say no to the address book.
 */
export function FindByUsername({
  onMessage,
  messaging = null,
}: {
  /** When given, a found person also gets a Message button (used by New chat). */
  onMessage?: (user: PublicUser) => void;
  /** Id of the person a chat is being opened with, to show progress. */
  messaging?: string | null;
} = {}) {
  const [raw, setRaw] = useState('');
  const [found, setFound] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function search() {
    setFound(null);
    setError(undefined);
    const parsed = usernameSchema.safeParse(raw.replace(/^@/, ''));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check that username.');
      return;
    }
    setBusy(true);
    try {
      setFound(await contactsApi.findByUsername(parsed.data));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'user_not_found'
          ? `Nobody is on Dyce as @${parsed.data}.`
          : authErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function add(user: PublicUser) {
    setAdding(true);
    setError(undefined);
    try {
      const res = await contactsApi.addFriend(user.id);
      setFound({ ...user, relationship: res.relationship });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TextField
        label="Find by username"
        value={raw}
        onChangeText={(t) => {
          setRaw(t);
          setError(undefined);
        }}
        placeholder="their.username"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={21}
        returnKeyType="search"
        onSubmitEditing={() => void search()}
        error={error}
        leading={
          <Text color="sub" variant="callout">
            @
          </Text>
        }
      />
      <TokenButton
        label={busy ? 'Searching…' : 'Search'}
        tone="chip"
        disabled={busy || raw.trim().length < 3}
        onPress={() => void search()}
      />
      {found ? (
        <PersonRow
          primary={found.displayName}
          username={found.username}
          relationship={found.relationship}
          busy={adding}
          onAdd={() => void add(found)}
        />
      ) : null}
      {found && onMessage ? (
        <PillButton
          label="Message"
          tone="primary"
          busy={messaging === found.id}
          accessibilityLabel={`Message @${found.username}`}
          onPress={() => onMessage(found)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 12 } });
