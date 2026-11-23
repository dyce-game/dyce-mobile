import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { DisputeReason } from '@dyce/shared';
import { formatNaira, MAX_DISPUTE_NOTE_LENGTH } from '@dyce/shared';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import {
  DISPUTE_REASON_LIST,
  disputeBadge,
  disputeBlockedText,
  disputeReasonLabel,
  disputeSteps,
  disputeWindowText,
} from '@/features/account/account-logic';
import { EdgeFrame, EdgeTitle } from '@/features/account/components/EdgeFrame';
import { useDisputeQuery, useOpenDispute } from '@/features/account/use-account';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { opponentOf } from '../games-logic';
import { useMatchQuery } from '../use-games';

/**
 * Dispute a Pool result (design: Dispute, DisputeStatus; SPEC section 9). Pick what went wrong, add a note, send.
 * Afterwards the same screen is the status: submitted, waiting for a person, decision. Told as the server works
 * (ADR-037): the pot is not frozen, a person reviews the game, and a wrong result is corrected afterwards.
 */
export function DisputeScreen({ matchId }: { matchId: string }) {
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const match = useMatchQuery(matchId).data;
  const info = useDisputeQuery(matchId);
  const open = useOpenDispute(matchId);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [note, setNote] = useState('');

  const opponent = match ? opponentOf(match, myId) : null;
  const oppName = opponent?.displayName || opponent?.username || 'your opponent';
  const me = match?.players.find((p) => p.userId === myId);
  const outcome = me?.result === 'win' ? 'you won' : me?.result === 'draw' ? 'a draw' : 'you lost';
  const data = info.data;
  const dispute = data?.dispute ?? null;
  const blocked = data ? disputeBlockedText(data) : null;
  const windowText = data ? disputeWindowText(data) : null;

  const summary = (
    <View style={[styles.summary, { backgroundColor: colors.bg2 }]}>
      <View style={styles.flex}>
        <Text variant="callout" numberOfLines={1}>
          {match ? `${match.gameName} vs ${oppName}` : 'This game'}
        </Text>
        <Text variant="footnote" color="sub">
          {match ? `${outcome} · pot ${formatNaira(match.potKobo)}` : ' '}
        </Text>
      </View>
      {dispute ? (
        <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
          <Text variant="caption" color="accent">
            {disputeBadge(dispute.status)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  if (info.isPending) {
    body = <ActivityIndicator color={colors.sub} style={styles.wait} />;
  } else if (info.isError || !data) {
    body = (
      <View style={styles.wait}>
        <Text color="accent" accessibilityLiveRegion="polite">
          {authErrorMessage(info.error)}
        </Text>
        <TokenButton label="Try again" tone="chip" onPress={() => void info.refetch()} />
      </View>
    );
  } else if (dispute) {
    body = (
      <>
        <View style={styles.steps} accessibilityLabel="Dispute progress">
          {disputeSteps(dispute).map((s, i, all) => {
            const done = s.state === 'done';
            const now = s.state === 'now';
            return (
              <View key={s.title} style={styles.step}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: done ? colors.money : now ? '#C93E1C' : 'transparent',
                        borderColor: done ? colors.money : now ? '#C9B8FF' : colors.line,
                      },
                    ]}
                  >
                    {done ? <Text style={styles.dotText}>✓</Text> : null}
                  </View>
                  {i < all.length - 1 ? (
                    <View
                      style={[styles.line, { backgroundColor: done ? colors.money : colors.line }]}
                    />
                  ) : null}
                </View>
                <View style={styles.stepBody}>
                  <Text variant="callout" color={s.state === 'next' ? 'sub' : 'text'}>
                    {s.title}
                  </Text>
                  <Text variant="footnote" color="sub" style={styles.stepText}>
                    {s.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={[styles.explain, { backgroundColor: colors.bg2 }]}>
          <Text variant="callout">Your dispute</Text>
          <Text variant="footnote" color="sub" style={styles.stepText}>
            {disputeReasonLabel(dispute.reason)}
            {dispute.note ? ` · “${dispute.note}”` : ''}
          </Text>
          <Text variant="callout" style={styles.gap}>
            If we find a problem
          </Text>
          <Text variant="footnote" color="sub" style={styles.stepText}>
            The result is corrected.
          </Text>
          <Text variant="callout" style={styles.gap}>
            If it was a fair game
          </Text>
          <Text variant="footnote" color="sub" style={styles.stepText}>
            The result stands and nothing changes.
          </Text>
        </View>
        <Text variant="footnote" color="sub" style={styles.reference} selectable>
          Reference {dispute.reference}
        </Text>
      </>
    );
  } else if (blocked || !data.canDispute) {
    body = (
      <Text color="sub" style={styles.blocked} accessibilityRole="alert">
        {blocked ?? 'This result can’t be disputed.'}
      </Text>
    );
  } else {
    body = (
      <>
        <Text variant="footnote" color="sub" style={styles.label} accessibilityRole="header">
          What went wrong?
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {DISPUTE_REASON_LIST.map((r) => {
            const on = reason === r.id;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityLabel={r.label}
                accessibilityState={{ selected: on }}
                onPress={() => setReason(r.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? colors.brandSoft : colors.chip,
                    borderColor: on ? '#C93E1C' : 'transparent',
                  },
                ]}
              >
                <Text variant="callout">{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="footnote" color="sub" style={styles.label}>
          Tell us more (optional)
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={MAX_DISPUTE_NOTE_LENGTH}
          accessibilityLabel="Tell us more (optional)"
          placeholder="What did you see?"
          placeholderTextColor={colors.sub}
          style={[styles.note, { backgroundColor: colors.chip, color: colors.text }]}
        />
        <View style={[styles.explain, { backgroundColor: colors.bg2 }]}>
          <Text variant="footnote" color="sub" style={styles.stepText}>
            A person on the Dyce team checks the game’s moves and timing. The result stands until
            they decide, and a wrong result is corrected afterwards. {windowText ?? ''}
          </Text>
        </View>
        {open.isError ? (
          <Text color="accent" style={styles.gap} accessibilityLiveRegion="polite">
            {authErrorMessage(open.error)}
          </Text>
        ) : null}
      </>
    );
    footer = (
      <TokenButton
        label={open.isPending ? 'Sending…' : 'Submit dispute'}
        disabled={!reason || open.isPending}
        onPress={() => reason && open.mutate({ reason, note: note.trim() || undefined })}
      />
    );
  }

  return (
    <EdgeFrame backLabel="Result" fallback={`/g/${matchId}/result`} footer={footer}>
      <EdgeTitle>{dispute ? 'Dispute status' : 'Dispute this result'}</EdgeTitle>
      {summary}
      {body}
    </EdgeFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wait: { paddingVertical: 24, gap: 12, alignItems: 'center' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    marginBottom: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  label: { paddingTop: 16, paddingBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
  },
  note: {
    minHeight: 110,
    borderRadius: 16,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Figtree_500Medium',
    textAlignVertical: 'top',
  },
  explain: { borderRadius: 16, padding: 14, marginTop: 14 },
  gap: { marginTop: 10 },
  blocked: { paddingVertical: 20, lineHeight: 22 },
  steps: { marginTop: 14 },
  step: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#fff', fontSize: 12, fontFamily: 'Figtree_800ExtraBold' },
  line: { width: 3, flex: 1, minHeight: 30 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepText: { lineHeight: 19, marginTop: 2 },
  reference: { textAlign: 'center', paddingTop: 16 },
});
