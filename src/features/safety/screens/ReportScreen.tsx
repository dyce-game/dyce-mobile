import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { ReportReason } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { REPORT_REASON_LIST } from '../safety-logic';
import { useReportUser } from '../use-safety';

/**
 * Report someone (design: Report, ReportDone). Pick what happened, optionally attach the recent messages of
 * your chat and block them in the same step, then send. They are never told who reported them. No reason is
 * pre-selected (the design pre-selects one): a report you didn't mean to send is worse than one more tap.
 */
export function ReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    userId: string;
    username?: string;
    name?: string;
    avatar?: string;
    conversationId?: string;
  }>();
  const report = useReportUser();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [alsoBlock, setAlsoBlock] = useState(true);

  const handle = params.username ? `@${params.username}` : 'this person';
  const display = params.name || params.username || 'Someone';
  const hasChat = typeof params.conversationId === 'string' && params.conversationId.length > 0;
  const done = report.isSuccess;
  const toChats = () => router.replace('/chat' as Href);
  const cancel = () => (router.canGoBack() ? router.back() : toChats());

  function send() {
    if (!reason) return;
    report.mutate({
      userId: params.userId,
      reason,
      conversationId: hasChat ? params.conversationId : undefined,
      alsoBlock,
    });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        {done ? (
          <View style={styles.side} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={cancel}
            style={styles.side}
          >
            <Text style={[styles.cancel, { color: colors.accent }]}>Cancel</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle} accessibilityRole="header">
          {done ? 'Report sent' : 'Report'}
        </Text>
        <View style={styles.side} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {done ? (
          <View style={styles.doneWrap}>
            <View style={[styles.check, { backgroundColor: colors.moneySoft }]}>
              <Svg
                width={40}
                height={40}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.money}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M5 12.5l4.5 4.5L19 7.5" />
              </Svg>
            </View>
            <Text style={styles.doneTitle} accessibilityLiveRegion="polite">
              Thanks, we&apos;re on it
            </Text>
            <Text color="sub" style={styles.doneText}>
              {report.data?.blocked
                ? `${handle} is blocked. They can't message you, send you money or find you. They aren't told.`
                : `We've got your report. ${handle} won't know it was you.`}
            </Text>
            <View style={[styles.next, { backgroundColor: colors.bg2 }]}>
              <View style={styles.nextRow}>
                <View style={[styles.nextDot, { backgroundColor: '#C93E1C' }]}>
                  <Text style={styles.nextDotText}>1</Text>
                </View>
                <View style={styles.nextBody}>
                  <Text style={styles.nextTitle}>A person reviews it</Text>
                  <Text variant="footnote" color="sub">
                    {hasChat
                      ? 'Using the messages you attached, not just the report.'
                      : "We'll look at the account and its recent activity."}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.who}>
              <UserAvatar
                avatar={params.avatar ? { v: 1, preset: params.avatar } : null}
                name={display}
                size={48}
              />
              <View>
                <Text style={styles.whoTitle}>Report {handle}</Text>
                <Text variant="footnote" color="sub">
                  They won&apos;t know who reported them
                </Text>
              </View>
            </View>

            <Text style={styles.label} color="sub" accessibilityRole="header">
              What happened?
            </Text>
            <View
              style={[styles.reasons, { backgroundColor: colors.bg2 }]}
              accessibilityRole="radiogroup"
            >
              {REPORT_REASON_LIST.map((r, i) => {
                const on = reason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${r.title}${r.help ? `. ${r.help}` : ''}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => setReason(r.id)}
                    style={[
                      styles.reason,
                      {
                        borderColor: colors.line,
                        borderBottomWidth: i === REPORT_REASON_LIST.length - 1 ? 0 : 1,
                      },
                    ]}
                  >
                    <View style={styles.reasonBody}>
                      <Text style={styles.reasonTitle}>{r.title}</Text>
                      {r.help ? (
                        <Text style={styles.reasonHelp} color="sub">
                          {r.help}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[styles.ring, { borderColor: on ? colors.danger : colors.chipEdge }]}
                    >
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: on ? colors.danger : 'transparent' },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {hasChat ? (
              <View style={[styles.evidence, { borderColor: colors.line }]}>
                <View style={[styles.evidenceTile, { backgroundColor: '#C93E1C' }]} aria-hidden />
                <View style={styles.reasonBody}>
                  <Text style={styles.evidenceTitle}>Chat with {handle}</Text>
                  <Text style={styles.reasonHelp} color="sub">
                    The latest messages are attached
                  </Text>
                </View>
                <Text style={styles.attached} color="money">
                  Attached
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Also block them"
              accessibilityState={{ checked: alsoBlock }}
              onPress={() => setAlsoBlock((b) => !b)}
              style={[styles.toggle, { backgroundColor: colors.bg2 }]}
            >
              <Text style={styles.toggleLabel}>Also block them</Text>
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: alsoBlock ? '#2BB673' : colors.chipEdge,
                    justifyContent: alsoBlock ? 'flex-end' : 'flex-start',
                  },
                ]}
              >
                <View style={styles.knob} />
              </View>
            </Pressable>

            {report.isError ? (
              <Text color="accent" accessibilityLiveRegion="polite">
                {authErrorMessage(report.error)}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={toChats}
            style={[styles.cta, { backgroundColor: '#C93E1C' }]}
          >
            <Text style={styles.ctaText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send report"
            accessibilityState={{ disabled: !reason || report.isPending }}
            disabled={!reason || report.isPending}
            onPress={send}
            style={[styles.cta, { backgroundColor: reason ? colors.danger : colors.chip }]}
          >
            <Text style={[styles.ctaText, { color: reason ? '#FFFFFF' : colors.sub }]}>
              {report.isPending ? 'Sending…' : reason ? 'Send report' : 'Choose a reason'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  side: { width: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { paddingBottom: 20, gap: 0 },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  whoTitle: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  label: { paddingHorizontal: 16, paddingTop: 10, fontSize: 13, fontFamily: 'Figtree_700Bold' },
  reasons: { marginHorizontal: 16, marginTop: 8, borderRadius: 18, overflow: 'hidden' },
  reason: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonBody: { flex: 1 },
  reasonTitle: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  reasonHelp: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  evidence: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  evidenceTile: { width: 34, height: 34, borderRadius: 10 },
  evidenceTitle: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  attached: { fontSize: 12, fontFamily: 'Figtree_700Bold' },
  toggle: {
    marginHorizontal: 16,
    marginTop: 10,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  track: { width: 52, height: 32, borderRadius: 16, padding: 3, flexDirection: 'row' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF' },
  footer: { paddingHorizontal: 16, paddingBottom: 10 },
  cta: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Figtree_700Bold' },
  doneWrap: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 24 },
  check: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 26,
    marginTop: 18,
    marginBottom: 6,
    fontFamily: 'BricolageGrotesque_700Bold',
    textAlign: 'center',
  },
  doneText: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: 'Figtree_500Medium' },
  next: {
    alignSelf: 'stretch',
    marginTop: 22,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  nextRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  nextDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextDotText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Figtree_800ExtraBold' },
  nextBody: { flex: 1 },
  nextTitle: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
});
