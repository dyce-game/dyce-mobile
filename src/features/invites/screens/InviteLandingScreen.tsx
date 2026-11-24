import { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { ApiError } from '@/features/auth/api-client';
import { track } from '@/lib/analytics';
import { config } from '@/lib/config';
import { InviteFrame } from '../components/InviteFrame';
import { rememberInvite } from '../pending-invite';
import { useInviteQuery, useLinkPhone } from '../use-invites';

/**
 * What someone opens from the text (design: InviteLanding): who is asking, which game, and one big way in:
 * play it right now in the browser. The number in the link's fragment is remembered on this device for
 * sign-up; nothing about it goes to the server.
 */
export function InviteLandingScreen({ token }: { token: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const q = useInviteQuery(token);
  const phone = useLinkPhone();

  useEffect(() => {
    void rememberInvite({ token, phone });
  }, [token, phone]);
  useEffect(() => {
    if (q.isSuccess) track({ name: 'invite_opened', surface: 'web' });
  }, [q.isSuccess]);

  const open = () => void Linking.openURL(`dyce://i/${token}`).catch(() => undefined);
  const join = () => router.push(`/i/${token}/join` as Href);

  if (q.isLoading) {
    return (
      <InviteFrame>
        <Text color="sub" accessibilityLiveRegion="polite">
          Opening your invite…
        </Text>
      </InviteFrame>
    );
  }

  if (q.isError || !q.data) {
    const missing = q.error instanceof ApiError && q.error.code === 'invite_not_found';
    return (
      <InviteFrame>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text variant="title" accessibilityRole="header" style={styles.center}>
            {missing ? "This invite link isn't valid" : "We couldn't open this invite"}
          </Text>
          <Text color="sub" style={styles.center}>
            {authErrorMessage(q.error)}
          </Text>
          {missing ? null : (
            <TokenButton label="Try again" tone="chip" onPress={() => void q.refetch()} />
          )}
        </View>
        <StoreButtons onJoin={() => router.replace('/welcome' as Href)} joinLabel="Get Dyce" />
      </InviteFrame>
    );
  }

  const inv = q.data;
  const name = inv.inviter.displayName || inv.inviter.username;

  if (inv.state !== 'open') {
    return (
      <InviteFrame>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <UserAvatar avatar={inv.inviter.avatar} name={name} size={96} />
          <Text variant="title" accessibilityRole="header" style={styles.center}>
            {inv.state === 'expired' ? 'This invite has expired' : "You're already on Dyce"}
          </Text>
          <Text color="sub" style={styles.center}>
            {inv.state === 'expired'
              ? `Ask ${name} to send you a new one. Every new player still starts with ₦200k in Dyce Cash.`
              : `${name} and you are friends now. Open Dyce to play.`}
          </Text>
        </View>
        <StoreButtons
          onJoin={() => router.replace((inv.state === 'joined' ? '/' : '/welcome') as Href)}
          joinLabel={inv.state === 'joined' ? 'Open Dyce' : 'Get Dyce'}
        />
      </InviteFrame>
    );
  }

  return (
    <InviteFrame right={{ label: 'Open in app', onPress: open }}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View accessible accessibilityLabel={`${name} is waiting for you`}>
          <UserAvatar avatar={inv.inviter.avatar} name={name} size={112} />
          <View style={styles.bubble} aria-hidden>
            <Text variant="footnote" color="#FFFFFF">
              your turn
            </Text>
          </View>
        </View>
        <Text variant="footnote" color="sub">
          @{inv.inviter.username}
        </Text>
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          {name} wants to play {inv.game.name} with you
        </Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: colors.moneySoft }]}>
            <Text variant="footnote" color={colors.money}>
              Free game
            </Text>
          </View>
          {inv.game.roundSeconds ? (
            <View style={[styles.chip, { backgroundColor: colors.bg2 }]}>
              <Text variant="footnote">{inv.game.roundSeconds} second round</Text>
            </View>
          ) : null}
        </View>
        {inv.guest.finished ? (
          <Text variant="callout" color="accent" style={styles.center}>
            You already played this one: {inv.guest.score ?? 0} points
          </Text>
        ) : null}
      </View>

      <View style={styles.spacer} />

      <View style={[styles.bonus, { backgroundColor: colors.brandSoft }]}>
        <Text variant="headline" color="accent">
          ₦200k
        </Text>
        <Text variant="footnote" style={styles.flex}>
          Every new player starts with ₦200k in Dyce Cash to play with.
        </Text>
      </View>

      {inv.game.guestPlayable ? (
        <TokenButton
          label={inv.guest.finished ? 'See your result' : 'Play now in browser'}
          accessibilityLabel={
            inv.guest.finished ? 'See your result' : `Play ${inv.game.name} now in your browser`
          }
          tone="ember"
          onPress={() => router.push(`/i/${token}/play` as Href)}
        />
      ) : null}
      <StoreButtons
        onJoin={join}
        joinLabel={inv.game.guestPlayable ? 'Sign up for Dyce' : 'Get Dyce to play'}
        primary={!inv.game.guestPlayable}
      />
      <Text variant="footnote" color="sub" style={styles.center}>
        Your result goes back to {name} as a message.
      </Text>
    </InviteFrame>
  );
}

/** "Get it on iPhone / Android" once the store pages exist; always a way to sign up here. */
export function StoreButtons({
  onJoin,
  joinLabel,
  primary,
}: {
  onJoin: () => void;
  joinLabel: string;
  primary?: boolean;
}) {
  const stores = [
    { label: 'Get it on iPhone', url: config.iosStoreUrl },
    { label: 'Get it on Android', url: config.androidStoreUrl },
  ]
    // Apple 2.3.10: the iPhone app and its pages never name or link another mobile platform.
    .filter((s) => Platform.OS !== 'ios' || s.label !== 'Get it on Android')
    .filter((s): s is { label: string; url: string } => !!s.url);
  return (
    <View style={styles.stores}>
      <TokenButton label={joinLabel} tone={primary ? 'ember' : 'chip'} onPress={onJoin} />
      {stores.length > 0 ? (
        <View style={styles.storeRow}>
          {stores.map((s) => (
            <Pressable
              key={s.label}
              accessibilityRole="link"
              accessibilityLabel={s.label}
              onPress={() => void Linking.openURL(s.url)}
              style={styles.store}
            >
              <Text variant="callout" color="#FFFFFF">
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
    boxShadow: '0px 12px 40px rgba(90,30,10,0.10)',
  },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  spacer: { flexGrow: 1, minHeight: 4 },
  bubble: {
    position: 'absolute',
    right: -34,
    bottom: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    backgroundColor: '#C93E1C',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  bonus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  stores: { gap: 10 },
  storeRow: { flexDirection: 'row', gap: 10 },
  store: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B140F',
  },
});
