import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { contactsApi } from '@/lib/api';
import { FindByUsername } from '@/features/contacts/components/FindByUsername';
import { PersonRow } from '@/features/contacts/components/PersonRow';
import { useContactSuggestionsQuery, useRefreshFriends } from '../use-friends';

/**
 * Add friends: people from contacts you've already synced who are on Dyce, a way to sync again, and exact
 * username search. Each person is one tap to add.
 */
export function AddFriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const suggestions = useContactSuggestionsQuery();
  const refresh = useRefreshFriends();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function add(userId: string) {
    setAddingId(userId);
    setError(undefined);
    try {
      await contactsApi.addFriend(userId);
      refresh();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setAddingId(null);
    }
  }

  const people = suggestions.data?.suggestions ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Add friends" fallback="/friends" />

        <View style={styles.section}>
          <Text variant="caption" color="sub" accessibilityRole="header">
            From your contacts
          </Text>
          {suggestions.isLoading ? <Text color="sub">Checking your contacts…</Text> : null}
          {suggestions.isError ? (
            <Text color="accent">{authErrorMessage(suggestions.error)}</Text>
          ) : null}
          {suggestions.isSuccess && people.length === 0 ? (
            <Text color="sub">
              Nobody new from your contacts yet. Sync again to look for people who joined recently.
            </Text>
          ) : null}
          {people.map((p) => (
            <PersonRow
              key={p.id}
              primary={p.displayName}
              username={p.username}
              relationship={p.relationship}
              busy={addingId === p.id}
              onAdd={() => void add(p.id)}
            />
          ))}
          {error ? (
            <Text color="accent" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <TokenButton
            label="Find friends in my contacts"
            tone="chip"
            onPress={() => router.push('/friends/contacts' as Href)}
          />
        </View>

        <View style={styles.section}>
          <FindByUsername />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 20 },
  section: { gap: 10 },
});
