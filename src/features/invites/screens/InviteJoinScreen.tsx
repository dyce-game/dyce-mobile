import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { regionOf } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { useSession } from '@/features/auth/use-session';
import { InviteFrame } from '../components/InviteFrame';
import { getPendingInvite, rememberInvite } from '../pending-invite';
import { useInviteQuery, useLinkPhone } from '../use-invites';

/**
 * Sign up from an invite (design: DeepLinkOnboard): who is waiting, the three steps, and "Text me a code".
 * The invite is remembered on this device and the phone screen opens with the invited number filled in; after
 * the username step the server joins the invite and the app lands in the game.
 */
export function InviteJoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const status = useSession((s) => s.status);
  const q = useInviteQuery(token);
  const linkPhone = useLinkPhone();
  const [phone, setPhone] = useState<string | null>(linkPhone);

  useEffect(() => {
    void (async () => {
      await rememberInvite({ token, phone: linkPhone });
      const saved = await getPendingInvite();
      setPhone(saved?.token === token ? saved.phone : linkPhone);
    })();
  }, [token, linkPhone]);

  // Already signed in: nothing to sign up for; the home screen picks the invite up from the server.
  if (status === 'signedIn') return <Redirect href="/" />;

  const inv = q.data;
  const name = inv ? inv.inviter.displayName || inv.inviter.username : 'A friend';
  const game = inv?.game.name ?? 'a game';
  const played = inv?.guest.finished === true;

  return (
    <InviteFrame>
      <View style={[styles.who, { backgroundColor: colors.card }]} accessible>
        {inv ? <UserAvatar avatar={inv.inviter.avatar} name={name} size={60} /> : null}
        <View style={styles.flex}>
          <Text variant="caption" color="accent">
            WAITING FOR YOU
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {name} · {game}
          </Text>
          <Text variant="footnote" color="sub">
            {played && (inv?.guest.score ?? 0) > 0
              ? `Free game · your score of ${inv?.guest.score} is saved`
              : 'Free game · your turn after sign-up'}
          </Text>
        </View>
      </View>

      <Text variant="title" accessibilityRole="header">
        One step and you&apos;re in
      </Text>
      <Text color="sub">
        {phone
          ? `We filled in the number ${name} texted. Check it and we'll send a code.`
          : "Confirm your number and we'll text a code."}
      </Text>

      {phone ? (
        <View style={[styles.number, { backgroundColor: colors.card }]} accessible>
          <Text variant="caption" color="sub">
            PHONE
          </Text>
          <Text variant="headline">{spaced(phone)}</Text>
        </View>
      ) : null}

      <View style={styles.steps}>
        <Step n="1" text="Confirm your number" on />
        <Step n="2" text="Pick a @username (we suggest one)" />
        <Step n="3" text={`Straight into ${name}'s game, avatar later`} />
      </View>

      <View style={styles.spacer} />
      <TokenButton
        label="Text me a code"
        tone="ember"
        onPress={() => router.push('/phone' as Href)}
      />
      {played ? (
        <Text variant="footnote" color="sub" style={styles.center}>
          Played in the browser already? Sign up with the same number and your score comes with you.
        </Text>
      ) : null}
    </InviteFrame>
  );
}

function Step({ n, text, on }: { n: string; text: string; on?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step} accessible accessibilityLabel={`Step ${n}: ${text}`}>
      <View style={[styles.dot, { backgroundColor: on ? '#C93E1C' : colors.sub }]} aria-hidden>
        <Text variant="footnote" color="#FFFFFF">
          {n}
        </Text>
      </View>
      <Text variant={on ? 'callout' : 'footnote'} color={on ? 'text' : 'sub'}>
        {text}
      </Text>
    </View>
  );
}

/** "+2348125590034" -> "+234 812 559 0034" (country code, then groups). */
function spaced(e164: string): string {
  const region = regionOf(e164);
  const m = /^(\+\d{1,3})(\d{3})(\d{3})(\d+)$/.exec(e164);
  return m && region ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22 },
  number: { gap: 2, padding: 14, borderRadius: 16 },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  spacer: { flexGrow: 1, minHeight: 4 },
});
