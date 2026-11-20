import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, Segmented, Text, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { NotificationSettings } from '@/features/notifications/NotificationSettings';
import { unregisterDevice } from '@/features/notifications/push';
import { authApi, sessionStore } from '@/lib/api';
import { POLICY_NOTES, POLICY_OPTIONS } from '../profile-logic';
import { useUpdateProfile } from '../use-profile';

/**
 * Settings (design: Settings): who can add and message you (friend requests and first messages follow it), your
 * account, blocked people, notification switches with quiet hours, appearance, and Log out.
 * "Who can see me online", Pool limits, data export, delete account and Help & legal arrive
 * with those features (see BACKLOG); nothing here is a dead switch.
 */
export function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const client = useQueryClient();
  const me = useMeQuery();
  const update = useUpdateProfile();
  const profile = me.data?.profile;
  const policy = profile?.requestPolicy ?? 'everyone';
  const go = (href: string) => router.push(href as Href);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as Href));

  async function logOut() {
    const refresh = sessionStore.getState().tokens?.refreshToken;
    // tell the server so the session can't be reused; signing out here must work even when offline
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
    await unregisterDevice(); // stop pushing to this phone before the session goes
    client.clear();
    await sessionStore.getState().signOut();
    // pushed screens aren't behind the tab gate, so leave them explicitly
    router.replace('/welcome' as Href);
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.grouped }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={back}
          style={styles.back}
        >
          <Icon name="back" size={24} color={colors.accent} strokeWidth={2.4} />
          <Text style={[styles.backText, { color: colors.accent }]}>Profile</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <Text style={styles.label} color="sub">
          Who can add and message me
        </Text>
        <Segmented
          label="Who can add and message me"
          options={POLICY_OPTIONS}
          value={policy}
          onChange={(requestPolicy) => {
            if (profile && requestPolicy !== policy) update.mutate({ requestPolicy });
          }}
        />
        {update.isError ? (
          <Text color="accent" style={styles.note} accessibilityLiveRegion="polite">
            {authErrorMessage(update.error)}
          </Text>
        ) : (
          <Text color="sub" style={styles.note} accessibilityLiveRegion="polite">
            {POLICY_NOTES[policy]}
          </Text>
        )}

        <Text style={styles.label} color="sub">
          Account
        </Text>
        <Card>
          <Row title="Name" value={profile?.displayName ?? ''} />
          <Row title="Username" value={profile ? `@${profile.username}` : ''} />
          <Row title="Edit profile" onPress={() => go('/profile/edit')} last />
        </Card>

        <Text style={styles.label} color="sub">
          People
        </Text>
        <Card>
          <Row title="Blocked people" onPress={() => go('/settings/blocked')} last />
        </Card>

        <NotificationSettings />

        <Text style={styles.label} color="sub">
          Appearance
        </Text>
        <Card>
          <Row title="Theme" sub="Switches with your phone" value="Follows your phone" last />
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={() => void logOut()}
          style={[styles.logout, { backgroundColor: colors.card }]}
        >
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
        <Text color="sub" style={styles.footer}>
          Dyce 1.0 · Dyce Cash is virtual and can&apos;t be withdrawn
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>;
}

function Row({
  title,
  sub,
  value,
  onPress,
  last,
}: {
  title: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? (
          <Text style={styles.rowSub} color="sub">
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} color="sub" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <View style={styles.chevron}>
          <Icon name="back" size={16} color={colors.sub} />
        </View>
      ) : null}
    </>
  );
  const style = [styles.row, { borderColor: colors.line, borderBottomWidth: last ? 0 : 1 }];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style} accessible accessibilityLabel={value ? `${title}, ${value}` : title}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  back: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  title: {
    fontSize: 32,
    letterSpacing: -0.6,
    marginTop: 2,
    marginBottom: 8,
    fontFamily: 'BricolageGrotesque_700Bold',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
  },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4, paddingTop: 6 },
  card: { borderRadius: 16, overflow: 'hidden' },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: { flex: 1, paddingVertical: 7 },
  rowTitle: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  rowSub: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  rowValue: { fontSize: 15, fontFamily: 'Figtree_500Medium', maxWidth: '50%' },
  chevron: { transform: [{ rotate: '180deg' }] },
  logout: {
    marginTop: 24,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 16, fontFamily: 'Figtree_600SemiBold' },
  footer: { fontSize: 12, textAlign: 'center', paddingTop: 12 },
});
