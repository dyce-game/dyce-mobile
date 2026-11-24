import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useOpenDirect } from '@/features/chat/use-chat';
import { streakCopy } from './streak-logic';
import { useStreakQuery, useStreakSeen } from './use-streak';

/**
 * "Streak ended at 4" (design: StreakLost and StreakLostDark): a card over the result of a game. A streak is
 * consecutive days with a win; when a day goes by without one it ends, and for the next 24 hours one Free win
 * brings the old length back (the streak saver, backend ADR-042). The server decides all of it; this shows it.
 * "Not now" and the rematch both mark the screen as seen so it does not come back for this loss.
 */
export function StreakLostScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const streak = useStreakQuery();
  const seen = useStreakSeen();
  const open = useOpenDirect();
  const status = streak.data;
  const copy = status ? streakCopy(status) : null;
  const rival = status?.lost?.brokenBy ?? null;

  const close = () => {
    seen.mutate();
    if (router.canGoBack()) router.back();
    else router.replace('/chat' as Href);
  };

  const play = () => {
    seen.mutate();
    if (!rival) {
      router.replace('/chat' as Href);
      return;
    }
    open.mutate(rival.id, {
      onSuccess: (conv) => router.replace(`/games?conversationId=${conv.id}` as Href),
    });
  };

  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityRole="alert">
        <View
          style={styles.hero}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="g" cx="50%" cy="50%" r="70%">
                <Stop offset="0" stopColor="#4A4A58" />
                <Stop offset="0.65" stopColor="#26262E" />
                <Stop offset="1" stopColor="#141418" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#g)" />
          </Svg>
          <View style={styles.flames}>
            <Svg
              width={70}
              height={96}
              viewBox="0 0 24 32"
              style={{ transform: [{ rotate: '-10deg' }] }}
            >
              <Path
                d="M12 1c1.3 4.6 6.5 7.2 6.5 13.7A6.6 6.6 0 0 1 12 21l-1-6 3-3-4-1 2-10z"
                fill="#9AA0AE"
              />
            </Svg>
            <Svg
              width={64}
              height={88}
              viewBox="0 0 24 32"
              style={{ transform: [{ rotate: '12deg' }], marginTop: 24 }}
            >
              <Path
                d="M10 9l3 2-3 3 1 7A6.6 6.6 0 0 1 5.5 14.7C5.5 12 7 10.2 8.3 8.9 8.7 11 9.8 12 10 9z"
                fill="#C3C7D0"
              />
            </Svg>
          </View>
        </View>

        <View style={styles.body}>
          {copy ? (
            <>
              <Text variant="title" style={styles.center} accessibilityRole="header">
                {copy.title}
              </Text>
              <Text color="sub" style={styles.center}>
                {copy.body}
              </Text>
              <View style={styles.items}>
                {copy.items.map((i) => (
                  <View
                    key={i.title}
                    style={[styles.item, { backgroundColor: colors.bg2 }]}
                    accessible
                    accessibilityLabel={`${i.title}. ${i.detail}`}
                  >
                    <View
                      style={[
                        styles.mark,
                        { backgroundColor: i.tone === 'ember' ? '#FF7A1A' : '#9AA0AE' },
                      ]}
                    >
                      <Text variant="footnote" style={styles.markText}>
                        {i.mark}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text variant="callout">{i.title}</Text>
                      <Text variant="footnote" color="sub">
                        {i.detail}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <TokenButton
                label={open.isPending ? 'Opening…' : copy.cta}
                tone="felt"
                disabled={open.isPending}
                onPress={play}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.alt}
                onPress={close}
                style={styles.alt}
              >
                <Text color="sub">{copy.alt}</Text>
              </Pressable>
              {open.isError ? (
                <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
                  {authErrorMessage(open.error)}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text variant="title" style={styles.center} accessibilityRole="header">
                {streak.isPending ? 'Checking your streak…' : 'No streak to save'}
              </Text>
              <TokenButton label="Back" tone="chip" onPress={close} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(8,6,20,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: { borderRadius: 32, overflow: 'hidden', maxWidth: 520, width: '100%', alignSelf: 'center' },
  hero: { height: 210, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flames: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { padding: 20, gap: 10 },
  center: { textAlign: 'center' },
  items: { gap: 8, marginTop: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: '#FFFFFF', fontWeight: '800' },
  flex: { flex: 1 },
  alt: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
