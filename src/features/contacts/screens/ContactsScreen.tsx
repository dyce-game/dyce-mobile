import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { getLocales } from 'expo-localization';
import { SafeAreaView } from 'react-native-safe-area-context';
import { prepareContacts } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { authApi, contactsApi, sessionStore } from '@/lib/api';
import { track } from '@/lib/analytics';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { useRefreshFriends } from '@/features/friends/use-friends';
import { authErrorMessage } from '@/features/auth/messages';
import { hrefForStep } from '@/features/auth/routes';
import { FindByUsername } from '../components/FindByUsername';
import { PersonRow } from '../components/PersonRow';
import {
  getContactsPermission,
  loadDeviceContacts,
  requestContactsPermission,
  type PermissionInfo,
} from '../device-contacts';
import { syncContacts, withRelationship, type SyncedMatch } from '../sync';

type Stage = 'checking' | 'intro' | 'syncing' | 'results' | 'denied';

/**
 * Onboarding "Find friends". We explain first, then show the OS prompt. If the user agrees we read the
 * address book on the device, normalise numbers, and send them (over TLS, in batches) to be matched; the
 * server keeps only the ids of people who are on Dyce. If they say no (or there is no address book, as on
 * web) we show "Allow in Settings" and "Find by username" instead of a dead end.
 */
export function ContactsScreen({ mode = 'onboarding' }: { mode?: 'onboarding' | 'standalone' }) {
  const router = useRouter();
  const { colors } = useTheme();
  const refreshFriends = useRefreshFriends();
  // standalone = opened later from "Add friends": no onboarding header, no step to complete.
  const standalone = mode === 'standalone';
  const [stage, setStage] = useState<Stage>('checking');
  const [permission, setPermission] = useState<PermissionInfo | null>(null);
  const [matches, setMatches] = useState<SyncedMatch[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getContactsPermission().then((p) => {
      if (cancelled) return;
      setPermission(p);
      setStage(p.state === 'denied' || p.state === 'unavailable' ? 'denied' : 'intro');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSync = useCallback(async () => {
    setStage('syncing');
    setError(undefined);
    try {
      const contacts = await loadDeviceContacts();
      // National-format numbers ("0803...") are read with the country of the user's own phone, then the
      // device region as a fallback. The device region alone is wrong for e.g. a Nigerian on a US-region phone.
      const region = sessionStore.getState().country ?? getLocales()[0]?.regionCode ?? undefined;
      const prepared = prepareContacts(contacts, region);
      const found = await syncContacts(
        prepared,
        (numbers) => contactsApi.match(numbers),
        (done, total) => setProgress({ done, total }),
      );
      setMatches(found);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setStage('results');
    }
  }, []);

  async function allow() {
    const result = await requestContactsPermission();
    setPermission(result);
    track({
      name: 'contacts_permission',
      result: result.state === 'granted' ? 'granted' : 'denied',
    });
    if (result.state === 'granted') await runSync();
    else setStage('denied');
  }

  async function add(item: SyncedMatch) {
    setAddingId(item.user.id);
    setError(undefined);
    try {
      const res = await contactsApi.addFriend(item.user.id);
      setMatches((prev) => withRelationship(prev, item.user.id, res.relationship));
      refreshFriends();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setAddingId(null);
    }
  }

  async function finish() {
    if (standalone) {
      if (router.canGoBack()) router.back();
      else router.replace('/friends' as Href);
      return;
    }
    setFinishing(true);
    try {
      const res = await authApi.completeStep('contacts');
      track({ name: 'signup_completed', step: 'contacts' });
      sessionStore.getState().setNextStep(res.nextStep);
      router.replace(hrefForStep(res.nextStep) as Href);
    } catch (err) {
      setError(authErrorMessage(err));
      setFinishing(false);
    }
  }

  const skip = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip"
      onPress={() => void finish()}
      style={styles.skip}
    >
      <Text color="sub" variant="callout">
        Skip
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {standalone ? (
          <ScreenHeader title="Find friends" fallback="/friends" />
        ) : (
          <AuthHeader step={3} right={skip} />
        )}

        {stage === 'intro' ? (
          <View style={styles.block}>
            <Text variant="title" accessibilityRole="header">
              Your people are already here
            </Text>
            <Text color="sub">
              Allow contacts to see who&apos;s on Dyce. Anyone who isn&apos;t gets a fun invite link
              by text.
            </Text>
            <Text variant="footnote" color="sub">
              Numbers are matched as hashes and never shown to strangers. We don&apos;t keep numbers
              of people who aren&apos;t on Dyce.
            </Text>
          </View>
        ) : null}

        {stage === 'syncing' ? (
          <View style={styles.block} accessibilityLiveRegion="polite">
            <Text variant="title" accessibilityRole="header">
              Looking for your friends…
            </Text>
            <Text color="sub">
              {progress
                ? `Checked ${progress.done} of ${progress.total} numbers`
                : 'Reading your contacts'}
            </Text>
          </View>
        ) : null}

        {stage === 'results' ? (
          <View style={styles.block}>
            <Text variant="title" accessibilityRole="header">
              {matches.length > 0 ? `${matches.length} on Dyce` : 'Nobody here yet'}
            </Text>
            {matches.length === 0 && !error ? (
              <Text color="sub">
                None of your contacts have joined yet. You&apos;ll be able to invite them by text,
                or find someone by username below.
              </Text>
            ) : null}
            {matches.map((m) => (
              <PersonRow
                key={m.user.id}
                primary={m.contactName || m.user.displayName}
                username={m.user.username}
                avatar={m.user.avatar}
                relationship={m.user.relationship}
                busy={addingId === m.user.id}
                onAdd={() => void add(m)}
              />
            ))}
            {error ? (
              <View style={styles.retry}>
                <Text color="accent" accessibilityLiveRegion="polite">
                  {error}
                </Text>
                <TokenButton label="Try again" tone="chip" onPress={() => void runSync()} />
              </View>
            ) : null}
          </View>
        ) : null}

        {stage === 'denied' ? (
          <View style={styles.block}>
            <Text variant="title" accessibilityRole="header">
              Contacts are off
            </Text>
            <Text color="sub">
              {permission?.state === 'unavailable'
                ? "This device can't share contacts with Dyce. You can still find friends by username."
                : "Without contacts we can't tell you who's already here. You can turn it on any time in Settings, or find friends by username."}
            </Text>
            {permission?.state === 'denied' ? (
              <TokenButton
                label="Allow in Settings"
                tone="chip"
                onPress={() => void Linking.openSettings()}
              />
            ) : null}
          </View>
        ) : null}

        {stage === 'results' || stage === 'denied' ? (
          <View style={styles.find}>
            <FindByUsername />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {stage === 'intro' ? (
          <TokenButton label="Allow contacts" onPress={() => void allow()} />
        ) : stage === 'results' || stage === 'denied' ? (
          <TokenButton
            label={
              finishing
                ? 'One moment…'
                : standalone
                  ? 'Done'
                  : stage === 'denied'
                    ? 'Continue without contacts'
                    : 'Continue'
            }
            disabled={finishing}
            onPress={() => void finish()}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 8 },
  block: { marginTop: 16, gap: 12 },
  find: { marginTop: 28 },
  retry: { gap: 8 },
  skip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
});
