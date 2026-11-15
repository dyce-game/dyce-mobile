import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { QrCode } from '../components/QrCode';
import { expiryLabel, requestUrl } from '../wallet-logic';
import { useCancelRequest, useRequestQuery } from '../use-wallet';

/**
 * Your request, as the person asking (design: request QR). It shows a QR code of `https://dyce.games/r/<code>`
 * with the amount and a countdown, and watches the server so it flips to "Paid" by itself when someone pays.
 * Anyone else who lands here is sent to the Pay screen.
 */
export function RequestDetailScreen({ code }: { code: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const request = useRequestQuery(code, { watch: true });
  const cancel = useCancelRequest(code);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const r = request.data;
  useEffect(() => {
    if (r && !r.mine) router.replace(`/wallet/pay/${code}` as Href);
  }, [r, code, router]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/wallet' as Href));
  const status =
    r && r.status === 'open' && expiryLabel(r.expiresAt, now) === 'Expired' ? 'expired' : r?.status;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Request" fallback="/wallet" />
        {request.isLoading ? <Text color="sub">Loading…</Text> : null}
        {request.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(request.error)}</Text>
            <TokenButton label="Back" tone="chip" onPress={done} />
          </View>
        ) : null}

        {r && r.mine ? (
          <>
            <View style={styles.center}>
              <Text variant="title" accessibilityRole="header">
                {r.amountKobo === null ? 'Any amount' : formatNaira(r.amountKobo)}
              </Text>
              {r.note ? <Text color="sub">{r.note}</Text> : null}
            </View>

            {status === 'open' ? (
              <>
                <View style={[styles.qr, { backgroundColor: '#FFFFFF', borderColor: colors.line }]}>
                  <QrCode
                    value={requestUrl(r.code)}
                    label={`QR code to pay ${r.amountKobo === null ? 'any amount' : formatNaira(r.amountKobo)}`}
                  />
                </View>
                <View style={styles.center}>
                  <Text variant="footnote" color="sub" selectable>
                    Code {r.code.slice(0, 5)} {r.code.slice(5)}
                  </Text>
                  <Text variant="footnote" color="sub" accessibilityLiveRegion="polite">
                    {expiryLabel(r.expiresAt, now)}
                  </Text>
                  <Text variant="footnote" color="sub">
                    Waiting for payment…
                  </Text>
                </View>
                <TokenButton
                  label="Share link"
                  onPress={() =>
                    void Share.share({ message: `Pay me on Dyce: ${requestUrl(r.code)}` })
                  }
                />
                <TokenButton
                  label={cancel.isPending ? 'Cancelling…' : 'Cancel request'}
                  tone="chip"
                  disabled={cancel.isPending}
                  onPress={() => cancel.mutate()}
                />
                {cancel.isError ? (
                  <Text color="accent">{authErrorMessage(cancel.error)}</Text>
                ) : null}
              </>
            ) : status === 'paid' ? (
              <View style={styles.center} accessibilityLiveRegion="polite">
                <Text variant="headline" color="money">
                  Paid
                </Text>
                <Text color="sub">
                  {r.paidBy
                    ? `by ${r.paidBy.displayName || `@${r.paidBy.username}`}`
                    : 'Payment received'}
                </Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Text variant="headline">{status === 'cancelled' ? 'Cancelled' : 'Expired'}</Text>
                <Text color="sub">This code no longer works. Make a new request any time.</Text>
              </View>
            )}
            {status !== 'open' ? <TokenButton label="Done" onPress={done} /> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14 },
  block: { gap: 10 },
  center: { alignItems: 'center', gap: 4 },
  qr: { alignSelf: 'center', padding: 8, borderRadius: 24, borderWidth: 1 },
});
