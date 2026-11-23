import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LiveChat, LiveState, SpaceView } from '@dyce/shared';
import { ModeBadge, Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import type { LiveStatus } from '../live-connection';
import { debugActions, phaseOf, refusalText, roomKindOf, secondsLeft } from '../party-logic';

/** What the view JSON shows before it is cut off (a Doodle canvas can be tens of KB). */
const VIEW_JSON_MAX = 3000;

type Props = {
  space: SpaceView;
  myId: string;
  live: LiveState;
  status: LiveStatus;
  receivedAt: number;
  errorCode: string | null;
  chats: LiveChat[];
  onMove: (action: unknown) => boolean;
  onChat: (text: string) => boolean;
  onForfeit: () => void;
  onBack: () => void;
};

/**
 * Debug-grade table for the live games that have no screen of their own yet (Crazy Cards, Imposter,
 * Werewolf, Charades, Doodle Guess): the room's connection, the phase and clock, who is seated, what the
 * server says you can see (your own `view()`), a few one-tap actions, a raw action box and the table talk.
 * It exists so the room can be played and tested from the app today; the real party screens replace it.
 * The protocol is dyce-backend/docs/PARTY_ROOM_PROTOCOL.md.
 */
export function PartyDebugTable(props: Props) {
  const { space, myId, live, status, receivedAt, errorCode, chats } = props;
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  const [raw, setRaw] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const kind = roomKindOf(live.gameSlug);
  const left = secondsLeft(live, receivedAt, now);
  const phase = phaseOf(live.view);
  const actions = debugActions(live.gameSlug, live.view, myId);
  const json = JSON.stringify(live.view, null, 1) ?? '';
  const name = (id: string) => {
    const m = space.members.find((x) => x.userId === id);
    return m ? (m.displayName || m.username) + (id === myId ? ' (you)' : '') : id.slice(0, 6);
  };
  const refusal = refusalText(errorCode);
  const over = live.status === 'finished';

  function sendRaw() {
    try {
      const action: unknown = JSON.parse(raw);
      setRawError(null);
      props.onMove(action);
    } catch {
      setRawError('That is not valid JSON.');
    }
  }

  function sendText() {
    const t = text.trim();
    if (!t) return;
    if (props.onChat(t)) setText('');
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={props.onBack}
          style={styles.back}
        >
          <Text color="accent">Back</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text variant="callout" numberOfLines={1} accessibilityRole="header">
            {space.gameName} · {space.name}
          </Text>
          <Text variant="footnote" color="sub">
            Debug table · {kind === 'party' ? 'party room' : 'turn room'}
          </Text>
        </View>
        <ModeBadge kind={live.mode === 'pool' ? 'POOL' : 'FREE'} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View
          style={[styles.card, { backgroundColor: colors.card }]}
          accessible
          accessibilityLabel={`Room ${status}, phase ${phase ?? 'none'}, ${left ?? 'no'} seconds left`}
        >
          <Row label="Room connected" value={status === 'live' ? 'yes' : status} />
          <Row label="Phase" value={over ? 'over' : (phase ?? '—')} />
          <Row
            label={live.waiting ? 'Clock' : 'Time left'}
            value={live.waiting ? 'waiting for everyone to join' : left === null ? '—' : `${left}s`}
          />
          <Row label="You can act" value={live.canAct ? 'yes' : 'no'} />
          <Row label="Version" value={String(live.version)} />
        </View>

        <Text variant="headline" accessibilityRole="header">
          Players
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {live.seats.map((s) => (
            <View
              key={s.userId}
              style={[styles.seat, { borderColor: colors.line }]}
              accessible
              accessibilityLabel={`Seat ${s.seat}, ${name(s.userId)}, ${
                s.forfeited ? 'left the game' : s.connected ? 'connected' : 'offline'
              }`}
            >
              <Text style={styles.seatNo} color="sub">
                {s.seat}
              </Text>
              <Text style={styles.flex} numberOfLines={1}>
                {name(s.userId)}
                {live.turnUserId === s.userId ? ' · to move' : ''}
              </Text>
              <Text variant="footnote" color={s.forfeited ? 'sub' : s.connected ? 'text' : 'sub'}>
                {s.forfeited ? 'left' : s.connected ? 'connected' : 'offline'}
              </Text>
            </View>
          ))}
        </View>

        {over && live.results ? (
          <>
            <Text variant="headline" accessibilityRole="header">
              Result
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {live.results.map((r) => (
                <View key={r.userId} style={[styles.seat, { borderColor: colors.line }]}>
                  <Text style={styles.seatNo} color="sub">
                    {r.placement}
                  </Text>
                  <Text style={styles.flex} numberOfLines={1}>
                    {name(r.userId)}
                  </Text>
                  <Text variant="footnote">
                    {r.result}
                    {r.payoutKobo !== null ? ` · ${r.payoutKobo / 100}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {!over ? (
          <>
            <Text variant="headline" accessibilityRole="header">
              Actions
            </Text>
            <View style={styles.actions}>
              {actions.length === 0 ? (
                <Text color="sub">Nothing to do right now.</Text>
              ) : (
                actions.map((a) => (
                  <TokenButton
                    key={a.label}
                    label={a.label}
                    tone="chip"
                    onPress={() => props.onMove(a.action)}
                  />
                ))
              )}
            </View>
            <TextField
              label="Raw action (JSON)"
              value={raw}
              onChangeText={setRaw}
              placeholder='{"kind":"ready"}'
              autoCapitalize="none"
              autoCorrect={false}
              error={rawError ?? undefined}
              returnKeyType="send"
              onSubmitEditing={sendRaw}
            />
            <TokenButton label="Send action" tone="chip" disabled={!raw.trim()} onPress={sendRaw} />
          </>
        ) : null}

        {refusal ? (
          <Text style={{ color: colors.danger }} accessibilityRole="alert">
            {refusal}
          </Text>
        ) : null}

        {kind === 'party' ? (
          <>
            <Text variant="headline" accessibilityRole="header">
              Table talk
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {chats.length === 0 ? (
                <Text color="sub" style={styles.pad}>
                  Nothing said yet. What you can hear depends on the game and the phase.
                </Text>
              ) : (
                chats.slice(-12).map((c) => (
                  <View key={c.id} style={[styles.seat, { borderColor: colors.line }]}>
                    <Text variant="footnote" color="sub">
                      {name(c.userId)}
                    </Text>
                    <Text style={styles.flex}>{c.text}</Text>
                  </View>
                ))
              )}
            </View>
            <TextField
              label="Say something"
              value={text}
              onChangeText={setText}
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={sendText}
            />
            <TokenButton label="Send" tone="chip" disabled={!text.trim()} onPress={sendText} />
          </>
        ) : null}

        <Text variant="headline" accessibilityRole="header">
          Your view
        </Text>
        <Text
          selectable
          style={[styles.mono, { backgroundColor: colors.chip, color: colors.ink }]}
          accessibilityLabel="Your view of the table as JSON"
        >
          {json.length > VIEW_JSON_MAX
            ? `${json.slice(0, VIEW_JSON_MAX)}\n… (${json.length} chars)`
            : json}
        </Text>

        {!over ? (
          confirmLeave ? (
            <View style={styles.actions}>
              <Text color="sub">Leaving forfeits your seat. Leave the game?</Text>
              <TokenButton label="Yes, leave" tone="ember" onPress={props.onForfeit} />
              <TokenButton label="Stay" tone="chip" onPress={() => setConfirmLeave(false)} />
            </View>
          ) : (
            <TokenButton label="Leave the game" tone="chip" onPress={() => setConfirmLeave(true)} />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.seat, { borderColor: colors.line }]}>
      <Text color="sub" style={styles.flex}>
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 16, overflow: 'hidden' },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seatNo: { width: 20 },
  pad: { padding: 14 },
  actions: { gap: 8 },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15, padding: 12, borderRadius: 12 },
});
