import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text, TokenButton, brand } from '@dyce/ui';
import { iForfeited, nameResolver, partyRefusal, phaseTotalMs, talkState } from './common-logic';
import {
  charadesStage,
  guesserChoices,
  isActor,
  lastEventLine,
  needsGuesser,
  scoreRows,
  winnerText,
} from './charades-logic';
import { usePhaseClock } from './use-now';
import { useSend } from './use-send';
import { useTilt } from './use-tilt';
import { parseCharadesView } from './views';
import type { PartyScreenProps } from './types';
import {
  CountdownRing,
  Dock,
  GLASS,
  GLASS_EDGE,
  InfoPill,
  LeaveSheet,
  Notice,
  ON,
  ON_DIM,
  PartyBanner,
  PartyHeader,
  Scene,
  useLeaveSheet,
} from './components/PartyChrome';
import { ResultsPanel } from './components/ResultsPanel';
import { TalkBox } from './components/TalkBox';

const SCENE = { top: '#4A1E14', bottom: '#140806', glow: 'rgba(255,150,110,0.30)' };
const PAPER = '#FFF6E4';
const INK = '#1B140F';

/**
 * Charades (design: PlayCharades): the card in the middle, the people guessing around it, and "Got it" /
 * "Skip" for whoever is acting. In act mode only the actor sees the card; in heads-up the phone goes on
 * the forehead and everyone else sees it (the room sends the word only to those allowed, so a hidden card
 * is hidden in the data too). Heads-up answers by tilting the phone, via the accelerometer when there is
 * one; the buttons are always there. Alone in act mode, "Got it" asks who guessed.
 */
export function CharadesScreen(p: PartyScreenProps) {
  const { space, myId, live, status, receivedAt, errorCode, chats } = p;
  const view = useMemo(() => parseCharadesView(live.view), [live.view]);
  const nameOf = useMemo(() => nameResolver(space, myId), [space, myId]);
  const { seconds } = usePhaseClock(live, receivedAt);
  const { sending, send } = useSend(p.onMove, live.version, errorCode);
  const leave = useLeaveSheet();
  const { width } = useWindowDimensions();
  const [naming, setNaming] = useState(false);
  const [flip, setFlip] = useState(false);

  const out = iForfeited(live, myId);
  const actor = view ? isActor(view, myId) : false;
  const acting = view?.phase === 'acting';
  const headsup = view?.mode === 'headsup';
  const canAnswer = !!view && acting && actor && !out && live.status === 'live';

  // A new card closes the "who guessed it?" picker.
  useEffect(() => setNaming(false), [view?.cardNo, view?.phase, view?.turn]);

  const gotIt = (guesser?: string) =>
    send(guesser ? { kind: 'got_it', guesser } : { kind: 'got_it' });
  const skip = () => send({ kind: 'skip' });
  const tilt = useTilt(canAnswer && headsup === true, flip, (e) => {
    if (sending || !view) return;
    if (e === 'got_it') gotIt();
    else if ((view.skipsLeft ?? 0) > 0) skip();
  });

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

  const over = live.status === 'finished' || view.phase === 'over';
  const stage = charadesStage(view, myId, nameOf);
  const me = space.members.find((m) => m.userId === myId);
  const rows = scoreRows(view, myId, nameOf);
  const talk = talkState('charades', view, myId, live);
  const refusal = partyRefusal(errorCode);
  const ticker = lastEventLine(view, nameOf, myId);
  const cardW = Math.min(width - 72, 300);
  const skipsLeft = view.skipsLeft ?? 0;

  return (
    <Scene colors={SCENE}>
      <PartyHeader space={space} onBack={p.onBack} onMenu={leave.show} />
      <PartyBanner status={status} live={live} />
      <InfoPill>
        <View
          style={styles.scores}
          accessibilityLabel={`Scores. ${rows.map((r) => `${r.label}: ${r.score}`).join('. ')}`}
          accessible
        >
          {rows.map((r) => (
            <View key={r.index} style={[styles.score, r.acting ? styles.scoreOn : null]}>
              <Text
                variant="footnote"
                numberOfLines={1}
                style={{ color: r.acting ? brand.brass.text : ON, maxWidth: 110 }}
              >
                {view.solo ? r.label : `Team ${r.index + 1}`}
                {r.mine ? ' (you)' : ''} · {r.score}
              </Text>
            </View>
          ))}
        </View>
      </InfoPill>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card
          width={cardW}
          view={view}
          myId={myId}
          seconds={seconds}
          nameOf={nameOf}
          tiltSupport={tilt}
        />
        {ticker ? (
          <Text variant="footnote" style={styles.ticker} accessibilityLiveRegion="polite">
            {ticker}
          </Text>
        ) : null}

        {canAnswer && headsup ? (
          <View style={styles.tiltRow}>
            <Text variant="footnote" style={{ color: ON_DIM, textAlign: 'center' }}>
              {tilt === 'yes'
                ? 'Tilt the phone down for got it, back for skip.'
                : tilt === 'no'
                  ? 'Tilt is not available here. Use the buttons.'
                  : 'Looking for the tilt sensor…'}
            </Text>
            {tilt === 'yes' ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Tilt feels backwards. Flip the direction"
                accessibilityState={{ checked: flip }}
                onPress={() => setFlip((f) => !f)}
                style={styles.flip}
              >
                <Text variant="footnote" style={{ color: '#FFD27A' }}>
                  {flip ? 'Direction flipped' : 'Tilt feels backwards? Flip it'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {naming && canAnswer ? (
          <View style={styles.naming} accessibilityViewIsModal={false}>
            <Text variant="callout" style={{ color: ON }}>
              Who guessed it?
            </Text>
            <View style={styles.chips}>
              {guesserChoices(view, myId).map((id) => (
                <TokenButton
                  key={id}
                  label={nameOf(id)}
                  tone="chip"
                  disabled={sending}
                  accessibilityLabel={`${nameOf(id)} guessed it`}
                  onPress={() => gotIt(id)}
                />
              ))}
            </View>
            <TokenButton label="Cancel" tone="chip" onPress={() => setNaming(false)} />
          </View>
        ) : null}

        <TalkBox chats={chats} talk={talk} nameOf={nameOf} onSend={p.onChat} />
      </ScrollView>

      <Notice text={refusal} />

      <Dock
        avatar={me?.avatar}
        name={nameOf(myId)}
        headline={out ? 'You left this game' : stage.headline}
        sub={out ? '' : stage.sub}
      >
        {!out && stage.action === 'start' ? (
          <TokenButton
            label="Start"
            tone="felt"
            disabled={sending}
            onPress={() => send({ kind: 'start' })}
          />
        ) : null}
        {!out && stage.action === 'card' ? (
          <View style={styles.answer}>
            <TokenButton
              label="Skip"
              tone="chip"
              disabled={sending || skipsLeft <= 0}
              accessibilityLabel={`Skip this card. ${skipsLeft} skips left`}
              onPress={skip}
            />
            <TokenButton
              label="Got it"
              tone="felt"
              disabled={sending}
              onPress={() => (needsGuesser(view) ? setNaming(true) : gotIt())}
            />
          </View>
        ) : null}
      </Dock>

      {over ? (
        <ResultsPanel
          space={space}
          live={live}
          myId={myId}
          nameOf={nameOf}
          title={winnerText(view, nameOf)}
          onContinue={p.onContinue}
          story={
            <View style={styles.resultStory}>
              {rows.map((r) => (
                <Text key={r.index} variant="callout" style={{ color: ON }}>
                  {r.label}: {r.score}
                </Text>
              ))}
            </View>
          }
        />
      ) : null}
      {leave.open ? <LeaveSheet space={space} onLeave={p.onForfeit} onStay={leave.hide} /> : null}
    </Scene>
  );
}

/** The card: its back while it is hidden from you, its face when you may read it. */
function Card({
  width,
  view,
  myId,
  seconds,
  nameOf,
  tiltSupport,
}: {
  width: number;
  view: NonNullable<ReturnType<typeof parseCharadesView>>;
  myId: string;
  seconds: number | null;
  nameOf: (id: string | null) => string;
  tiltSupport: 'unknown' | 'yes' | 'no';
}) {
  const actor = isActor(view, myId);
  const acting = view.phase === 'acting';
  const face = acting && view.word !== null;
  const over = view.phase === 'over';
  const ring = (
    <CountdownRing
      seconds={over ? null : seconds}
      totalMs={phaseTotalMs('charades', view.phase, (seconds ?? 0) * 1000)}
      size={42}
      color="#FFD27A"
      track="rgba(255,255,255,0.3)"
    />
  );
  const title = !acting
    ? 'GET READY'
    : actor
      ? view.mode === 'headsup'
        ? 'ON YOUR FOREHEAD'
        : 'ACT IT OUT'
      : view.mode === 'headsup'
        ? 'HELP THEM GUESS'
        : 'GUESS IT';

  return (
    <View
      style={[styles.card, { width, backgroundColor: face ? PAPER : '#6A2414' }]}
      accessible
      accessibilityLabel={
        face
          ? `Card ${view.cardNo} of ${view.cardsPerTurn}. Category ${view.category ?? 'none'}. ${view.word}`
          : acting
            ? actor
              ? 'The card is hidden from you. Your team guesses.'
              : `${nameOf(view.actor)} is acting. The card is hidden.`
            : `${nameOf(view.actor)} is up next`
      }
    >
      <View style={styles.ribbon}>
        <Text variant="caption" style={{ color: '#fff' }}>
          {title}
        </Text>
        {ring}
      </View>
      <View style={styles.cardBody}>
        {face ? (
          <>
            <Text variant="caption" style={{ color: '#B33416' }}>
              {view.category ?? ''}
            </Text>
            <Text
              variant="title"
              style={[styles.word, { color: INK }]}
              adjustsFontSizeToFit
              numberOfLines={3}
            >
              {view.word}
            </Text>
            <Text variant="footnote" style={{ color: '#6F655B', textAlign: 'center' }}>
              {view.mode === 'headsup'
                ? 'Give clues. Do not say the word.'
                : 'No talking. No pointing at real things. Sounds are allowed.'}
            </Text>
          </>
        ) : (
          <>
            <Text variant="title" style={[styles.word, { color: '#fff' }]} numberOfLines={3}>
              {acting
                ? actor
                  ? view.mode === 'headsup'
                    ? 'Phone on your forehead'
                    : 'Your team is guessing'
                  : `${nameOf(view.actor)} is acting`
                : over
                  ? 'That is the game'
                  : actor
                    ? 'You are up'
                    : `${nameOf(view.actor)} is up`}
            </Text>
            <Text
              variant="footnote"
              style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}
            >
              {acting
                ? actor && view.mode === 'headsup'
                  ? tiltSupport === 'yes'
                    ? 'Down is got it. Back is skip.'
                    : 'Use the buttons below.'
                  : 'Shout your guesses.'
                : view.mode === 'headsup'
                  ? 'Heads-up: the card goes on the forehead.'
                  : 'Act mode: only the actor sees the card.'}
            </Text>
          </>
        )}
      </View>
      <View style={styles.cardFoot}>
        <Text variant="caption" style={{ color: face ? '#6F655B' : 'rgba(255,255,255,0.8)' }}>
          {acting
            ? `Card ${view.cardNo} of ${view.cardsPerTurn} · ${actor ? 'you are acting' : `${nameOf(view.actor)} is acting`}`
            : `Turn ${Math.min(view.turn + 1, view.turns)} of ${view.turns}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingTop: 12, paddingBottom: 8, gap: 12, alignItems: 'stretch' },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  score: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
  },
  scoreOn: { backgroundColor: brand.brass.fill },
  card: {
    alignSelf: 'center',
    minHeight: 300,
    borderRadius: 26,
    overflow: 'hidden',
    boxShadow: '0px 24px 40px rgba(0,0,0,0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ribbon: {
    minHeight: 62,
    backgroundColor: '#C93E1C',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBody: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 190,
  },
  word: { textAlign: 'center' },
  cardFoot: {
    minHeight: 44,
    borderTopWidth: 2,
    borderTopColor: 'rgba(0,0,0,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  ticker: { color: '#FFD27A', textAlign: 'center', paddingHorizontal: 20 },
  tiltRow: { gap: 4, alignItems: 'center', paddingHorizontal: 20 },
  flip: { minHeight: 44, justifyContent: 'center' },
  naming: {
    marginHorizontal: 12,
    padding: 12,
    gap: 8,
    borderRadius: 18,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  answer: { flexDirection: 'row', gap: 8 },
  resultStory: { gap: 2, paddingBottom: 6 },
});
