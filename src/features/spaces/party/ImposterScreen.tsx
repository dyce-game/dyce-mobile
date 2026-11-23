import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { Text, TokenButton, brand } from '@dyce/ui';
import {
  iForfeited,
  nameResolver,
  partyRefusal,
  phaseTotalMs,
  seatNote,
  talkState,
} from './common-logic';
import {
  clueProblem,
  endSummary,
  imposterStage,
  imposterWord,
  latestClues,
  roleCard,
  toggleVote,
  voteComplete,
  votesAgainst,
} from './imposter-logic';
import { usePhaseClock } from './use-now';
import { useSend } from './use-send';
import { parseImposterView } from './views';
import type { PartyScreenProps } from './types';
import {
  CountdownRing,
  Dock,
  InfoPill,
  LeaveSheet,
  Notice,
  PartyBanner,
  PartyHeader,
  Scene,
  SendRow,
  GLASS,
  GLASS_EDGE,
  ON,
  ON_DIM,
  useLeaveSheet,
} from './components/PartyChrome';
import { HoldToReveal } from './components/HoldToReveal';
import { ResultsPanel } from './components/ResultsPanel';
import { RingTable } from './components/RingTable';
import { Seat, type SeatTag } from './components/Seats';
import { TalkBox } from './components/TalkBox';

const SCENE = { top: '#2A1E16', bottom: '#0C0806', glow: 'rgba(255,214,150,0.28)' };
const CREW_CARD = { bg: '#FFF6E4', fg: '#1B140F', sub: '#6F655B', label: 'YOUR SECRET WORD' };
const IMPOSTER_CARD = {
  bg: '#2A241F',
  fg: '#FF8F6B',
  sub: 'rgba(255,255,255,0.75)',
  label: 'ONLY YOU DO NOT KNOW',
};

/**
 * Imposter (design: PlayImposter, PlayImposterRole): the round table with everyone's clue beside them, your
 * secret card (hold to look), then the vote. All from this seat's own `view()`: an imposter's view never
 * contains the word. Timers come from the server's clock. Tap a player to suspect them; the dock sends.
 */
export function ImposterScreen(p: PartyScreenProps) {
  const { space, myId, live, status, receivedAt, errorCode, chats } = p;
  const view = useMemo(() => parseImposterView(live.view), [live.view]);
  const nameOf = useMemo(() => nameResolver(space, myId), [space, myId]);
  const { seconds } = usePhaseClock(live, receivedAt);
  const { sending, send } = useSend(p.onMove, live.version, errorCode);
  const leave = useLeaveSheet();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string[]>([]);
  const phase = view?.phase ?? 'reveal';

  // A new phase starts with a clean slate.
  useEffect(() => setPicked([]), [phase]);

  if (!view) {
    return (
      <Scene colors={SCENE}>
        <PartyHeader space={space} onBack={p.onBack} onMenu={leave.show} />
        <View style={styles.center}>
          <Text style={{ color: ON }}>The table could not be read. Try again.</Text>
        </View>
      </Scene>
    );
  }

  const out = iForfeited(live, myId);
  const over = live.status === 'finished' || view.phase === 'over';
  const stage = imposterStage(view, myId, nameOf);
  const card = roleCard(view, nameOf);
  const clues = latestClues(view);
  const me = space.members.find((m) => m.userId === myId);
  const need = view.imposterCount;
  const myVoteDone = view.voted.includes(myId);
  const canPick = view.phase === 'vote' && !myVoteDone && !out && !sending;
  const talk = talkState('imposter', view, myId, live);
  const compact = view.players.length > 7;
  const tableH = Math.round(Math.min(Math.max(width * 0.92, 300), 380));
  const refusal = partyRefusal(errorCode);
  const summary = over ? endSummary(view, nameOf) : null;
  const myCard = card.kind === 'imposter' ? IMPOSTER_CARD : CREW_CARD;

  const tagFor = (id: string): SeatTag | null => {
    if (over && view.imposters?.includes(id)) return { text: 'IMPOSTER', bg: brand.ember.fill };
    if (picked.includes(id)) return { text: 'VOTE', bg: brand.ember.fill };
    if ((view.phase === 'guess' || over) && view.accused.includes(id))
      return { text: 'CAUGHT', bg: brand.brass.fill, fg: brand.brass.text };
    if (view.phase === 'vote' && view.voted.includes(id))
      return { text: 'VOTED', bg: 'rgba(255,255,255,0.22)' };
    if (view.phase === 'reveal' && view.ready.includes(id))
      return { text: 'READY', bg: 'rgba(255,255,255,0.22)' };
    if (view.partners.includes(id)) return { text: 'PARTNER', bg: brand.ember.fill };
    return null;
  };

  return (
    <Scene colors={SCENE}>
      <PartyHeader space={space} onBack={p.onBack} onMenu={leave.show} />
      <PartyBanner status={status} live={live} />
      <InfoPill>
        <Text
          variant="footnote"
          style={{ color: ON }}
          accessibilityLabel={`${view.players.length} players, ${need} ${imposterWord(need)}. Word pack: ${view.packLabel}`}
        >
          {view.players.length} players · {need} {imposterWord(need)}
        </Text>
      </InfoPill>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <RingTable
          players={view.players}
          myId={myId}
          height={tableH}
          seatWidth={compact ? 70 : 84}
          surface={({ w, h }) => <TableSurface w={w} h={h} />}
          center={
            <View style={styles.centerLabel}>
              <CountdownRing
                seconds={seconds}
                totalMs={phaseTotalMs('imposter', view.phase, (seconds ?? 0) * 1000)}
                size={52}
              />
              <Text variant="caption" style={styles.tableLabel}>
                {view.phase === 'clue'
                  ? `CLUE ROUND ${view.round ?? 1}`
                  : view.phase === 'reveal'
                    ? 'LOOK AT YOUR CARD'
                    : view.phase === 'vote'
                      ? 'VOTE'
                      : view.phase === 'guess'
                        ? 'LAST GUESS'
                        : 'GAME OVER'}
              </Text>
            </View>
          }
          renderSeat={(id) => {
            const clue = clues.get(id);
            const speaking = view.phase === 'clue' && view.speaker === id;
            const bubble = speaking
              ? { text: '…', bg: brand.brass.fill, fg: brand.brass.text }
              : clue === undefined
                ? null
                : { text: clue ?? '—' };
            const picks = picked.includes(id);
            const votes = votesAgainst(view, id);
            const tag = tagFor(id);
            const name = nameOf(id);
            const m = space.members.find((x) => x.userId === id);
            return (
              <Seat
                name={name}
                avatar={m?.avatar}
                size={compact ? 42 : 52}
                width={compact ? 70 : 84}
                ring={
                  picks
                    ? brand.ember.fill
                    : speaking
                      ? brand.brass.fill
                      : view.accused.includes(id)
                        ? brand.ember.fill
                        : 'rgba(255,255,255,0.4)'
                }
                tag={tag}
                bubble={bubble}
                caption={votes && votes > 0 ? `${votes} ${votes === 1 ? 'vote' : 'votes'}` : null}
                note={seatNote(live, id)}
                dim={seatNote(live, id) === 'left'}
                selected={picks}
                onPress={
                  canPick && id !== myId
                    ? () => setPicked((cur) => toggleVote(cur, id, need))
                    : undefined
                }
                accessibilityLabel={`${name}${clue ? `, clue ${clue}` : ''}${speaking ? ', giving a clue now' : ''}${
                  tag ? `, ${tag.text.toLowerCase()}` : ''
                }${votes ? `, ${votes} votes` : ''}${canPick && id !== myId ? (picks ? ', picked. Tap to unpick' : ', tap to suspect') : ''}`}
              />
            );
          }}
        />

        {!over ? (
          <HoldToReveal
            card={card}
            resetKey={`${view.phase}`}
            colors={myCard}
            hiddenLabel={view.phase === 'reveal' ? 'CHECK YOUR ROLE' : 'YOUR ROLE'}
          />
        ) : null}

        <TalkBox chats={chats} talk={talk} nameOf={nameOf} onSend={p.onChat} />
      </ScrollView>

      <Notice text={refusal} />

      {stage.action === 'clue' || stage.action === 'guess' ? (
        <View style={styles.inputBox}>
          <Text variant="footnote" style={{ color: ON_DIM }}>
            {stage.action === 'clue' ? 'Your clue: one to three words' : 'Guess the secret word'}
          </Text>
          <View style={styles.inputRow}>
            <SendRow
              label={stage.action === 'clue' ? 'Your clue' : 'Your guess at the word'}
              placeholder={stage.action === 'clue' ? 'e.g. smoky' : 'The secret word'}
              button={stage.action === 'clue' ? 'Say clue' : 'Guess'}
              maxLength={60}
              disabled={sending || out}
              problem={(t) =>
                stage.action === 'clue' ? clueProblem(t) : t.trim() ? null : 'Type a word first.'
              }
              onSend={(t) =>
                send(
                  stage.action === 'clue' ? { kind: 'clue', text: t } : { kind: 'guess', text: t },
                )
              }
              autoFocus
            />
          </View>
        </View>
      ) : null}

      <Dock
        avatar={me?.avatar}
        name={nameOf(myId)}
        headline={out ? 'You left this game' : stage.headline}
        sub={out ? '' : stage.sub}
        tone={stage.tone === 'danger' ? 'ember' : 'brass'}
      >
        {!out && stage.action === 'ready' ? (
          <TokenButton
            label="I am ready"
            tone="ember"
            disabled={sending}
            onPress={() => send({ kind: 'ready' })}
          />
        ) : null}
        {!out && stage.action === 'vote' ? (
          <TokenButton
            label="Vote"
            tone="ember"
            accessibilityLabel={
              voteComplete(picked, need)
                ? `Vote for ${picked.map((x) => nameOf(x)).join(' and ')}`
                : `Vote. Pick ${need} first`
            }
            disabled={sending || !voteComplete(picked, need)}
            onPress={() => send({ kind: 'vote', targets: picked })}
          />
        ) : null}
      </Dock>

      {over ? (
        <ResultsPanel
          space={space}
          live={live}
          myId={myId}
          nameOf={nameOf}
          title={stage.headline}
          sub={summary?.winnerLine}
          onContinue={p.onContinue}
          story={
            summary ? (
              <View
                style={styles.story}
                accessible
                accessibilityLabel={`The imposters were ${summary.imposters}. The word was ${summary.word}.`}
              >
                <Text variant="callout" style={{ color: ON }}>
                  {need === 1 ? 'The imposter' : 'The imposters'}: {summary.imposters}
                </Text>
                <Text variant="callout" style={{ color: ON }}>
                  The word: {summary.word}
                </Text>
                {summary.guesses.map((g) => (
                  <Text key={g} variant="footnote" style={{ color: ON_DIM }}>
                    {g}
                  </Text>
                ))}
                {summary.tally.length > 0 ? (
                  <Text variant="footnote" style={{ color: ON_DIM }}>
                    Votes: {summary.tally.join(' · ')}
                  </Text>
                ) : null}
              </View>
            ) : null
          }
        />
      ) : null}
      {leave.open ? <LeaveSheet space={space} onLeave={p.onForfeit} onStay={leave.hide} /> : null}
    </Scene>
  );
}

function TableSurface({ w, h }: { w: number; h: number }) {
  const rx = w / 2 - 44;
  const ry = h / 2 - 58;
  return (
    <Svg width={w} height={h}>
      <Ellipse cx={w / 2} cy={h / 2 + 8} rx={rx} ry={ry} fill="#2A1608" />
      <Ellipse cx={w / 2} cy={h / 2} rx={rx} ry={ry} fill="#5A3418" />
      <Ellipse cx={w / 2} cy={h / 2 - 2} rx={rx - 14} ry={ry - 12} fill="#1F4A3A" />
      <Ellipse
        cx={w / 2}
        cy={h / 2 - 2}
        rx={rx - 14}
        ry={ry - 12}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={2}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingTop: 8, paddingBottom: 8, gap: 10 },
  centerLabel: { alignItems: 'center', gap: 4 },
  tableLabel: { color: 'rgba(255,255,255,0.8)' },
  inputBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    gap: 6,
    borderRadius: 22,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  inputRow: { flexDirection: 'row' },
  story: { gap: 4, paddingBottom: 6 },
});
