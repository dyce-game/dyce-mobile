import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { Text, TokenButton, brand } from '@dyce/ui';
import { iForfeited, nameResolver, partyRefusal, seatNote, talkState } from './common-logic';
import {
  ROLE_INFO,
  compositionLine,
  isAlive,
  knownRole,
  lastNightLine,
  logLines,
  nightAction,
  packLine,
  packVotes,
  seerFindings,
  werewolfStage,
  winnerLine,
} from './werewolf-logic';
import { usePhaseClock } from './use-now';
import { useSend } from './use-send';
import { parseWerewolfView, type WerewolfRole } from './views';
import type { PartyScreenProps } from './types';
import {
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
  PhaseTag,
  Scene,
  useLeaveSheet,
} from './components/PartyChrome';
import { HoldToReveal } from './components/HoldToReveal';
import { ResultsPanel } from './components/ResultsPanel';
import { RingTable } from './components/RingTable';
import { Seat, type SeatTag } from './components/Seats';
import { TalkBox } from './components/TalkBox';

const NIGHT = { top: '#16204A', bottom: '#060A1C', glow: 'rgba(255,140,60,0.22)' };
const DAY = { top: '#5B7FB5', bottom: '#1D2845', glow: 'rgba(255,220,150,0.25)' };
const ACTION_COLOR = { kill: brand.ember.fill, inspect: '#7B5CD6', protect: '#1C7AC0' } as const;
const ACTION_TONE = { kill: 'ember', inspect: 'bot', protect: 'sms' } as const;
const ACTION_TAG = { kill: 'VICTIM', inspect: 'INSPECT', protect: 'PROTECT' } as const;

/**
 * Werewolf (design: PlayWerewolf): everyone around the campfire, night actions by role (tap a player, then
 * the button), the day talk and the vote, and the dead watching with every role visible. Everything comes
 * from this seat's own `view()`, which never says what another living player is. The dock's button follows
 * `canAct`'s meaning: you only ever see your own ability.
 */
export function WerewolfScreen(p: PartyScreenProps) {
  const { space, myId, live, status, receivedAt, errorCode, chats } = p;
  const view = useMemo(() => parseWerewolfView(live.view), [live.view]);
  const nameOf = useMemo(() => nameResolver(space, myId), [space, myId]);
  const { seconds } = usePhaseClock(live, receivedAt);
  const { sending, send } = useSend(p.onMove, live.version, errorCode);
  const leave = useLeaveSheet();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const phaseKey = view ? `${view.phase}-${view.night}` : 'x';

  useEffect(() => setPicked(null), [phaseKey]);

  if (!view) {
    return (
      <Scene colors={NIGHT}>
        <PartyHeader space={space} onBack={p.onBack} onMenu={leave.show} />
        <View style={styles.center}>
          <Text style={{ color: ON }}>The table could not be read. Try again.</Text>
        </View>
      </Scene>
    );
  }

  const out = iForfeited(live, myId);
  const over = live.status === 'finished' || view.phase === 'over';
  const alive = isAlive(view, myId);
  const stage = werewolfStage(view, myId);
  const job = nightAction(view, myId);
  const me = space.members.find((m) => m.userId === myId);
  const night = view.phase === 'night';
  const role = view.role;
  const info = role ? ROLE_INFO[role] : null;
  const talk = talkState('werewolf', view, myId, live);
  const pack = packVotes(view);
  const refusal = partyRefusal(errorCode);
  const tableH = Math.round(Math.min(Math.max(width * 0.9, 300), 370));

  // Who the tap picks: your night targets, or anyone alive but you in the vote.
  const pickable: string[] =
    night && job && !job.done
      ? job.targets
      : view.phase === 'vote' && alive && !view.voted.includes(myId)
        ? view.alive.filter((a) => a !== myId)
        : [];
  const pickColor = job && night ? ACTION_COLOR[job.kind] : brand.ember.fill;
  const pickWord = job && night ? ACTION_TAG[job.kind] : 'VOTE';
  const canTap = pickable.length > 0 && !sending && !out;

  const card = {
    title: info?.label ?? 'Watching',
    hint: info?.blurb ?? 'You are not playing this round.',
    spoken: info ? `You are the ${info.label}. ${info.blurb}` : 'You are watching.',
  };

  const tagFor = (id: string): SeatTag | null => {
    const r = knownRole(view, id);
    if (!isAlive(view, id)) {
      return { text: r ? `OUT · ${ROLE_INFO[r].label}` : 'OUT', bg: '#2A2420' };
    }
    if (picked === id) return { text: pickWord, bg: pickColor };
    if (job?.current === id) return { text: ACTION_TAG[job.kind], bg: ACTION_COLOR[job.kind] };
    if (view.phase === 'vote' && view.voted.includes(id))
      return { text: 'VOTED', bg: 'rgba(255,255,255,0.22)' };
    if (view.phase === 'day' && view.ready.includes(id))
      return { text: 'READY', bg: 'rgba(255,255,255,0.22)' };
    if (r && view.roles) return { text: ROLE_INFO[r].label.toUpperCase(), bg: ROLE_INFO[r].color };
    if (view.wolves?.includes(id) && id !== myId) return { text: 'WOLF', bg: brand.ember.fill };
    return null;
  };

  const lines = logLines(view.log, nameOf);
  const nightLine = lastNightLine(view, nameOf);
  const findings = role === 'seer' ? seerFindings(view, nameOf) : [];

  return (
    <Scene colors={night || over ? NIGHT : DAY}>
      <PartyHeader space={space} onBack={p.onBack} onMenu={leave.show} />
      <PartyBanner status={status} live={live} />
      <View style={styles.tagRow}>
        <PhaseTag
          label={
            over
              ? 'GAME OVER'
              : `${night ? 'NIGHT' : view.phase === 'vote' ? 'VOTE' : 'DAY'} ${view.night}`
          }
          seconds={over ? null : seconds}
        />
      </View>
      <InfoPill>
        <Text variant="footnote" style={{ color: ON }}>
          {view.alive.length} alive · {compositionLine(view)}
        </Text>
      </InfoPill>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <RingTable
          players={view.players}
          myId={myId}
          height={tableH}
          seatWidth={view.players.length > 8 ? 74 : 84}
          surface={({ w, h }) => <Ground w={w} h={h} night={night || over} />}
          center={<Campfire lit={night || over} />}
          renderSeat={(id) => {
            const m = space.members.find((x) => x.userId === id);
            const dead = !isAlive(view, id);
            const tap = canTap && pickable.includes(id);
            const isPick = picked === id;
            const name = nameOf(id);
            const tag = tagFor(id);
            const packPicks = pack.get(id)?.length ?? 0;
            return (
              <Seat
                name={name}
                avatar={m?.avatar}
                size={view.players.length > 8 ? 40 : 46}
                width={view.players.length > 8 ? 74 : 84}
                ring={
                  isPick
                    ? pickColor
                    : job?.current === id
                      ? ACTION_COLOR[job.kind]
                      : 'rgba(255,255,255,0.4)'
                }
                tag={tag}
                caption={
                  role === 'werewolf' && night && packPicks > 0
                    ? `${packPicks} ${packPicks === 1 ? 'pick' : 'picks'}`
                    : null
                }
                note={seatNote(live, id)}
                dim={dead || seatNote(live, id) === 'left'}
                selected={isPick}
                onPress={tap ? () => setPicked(isPick ? null : id) : undefined}
                accessibilityLabel={`${name}${dead ? ', out of the game' : ''}${tag ? `, ${tag.text.toLowerCase()}` : ''}${
                  tap ? (isPick ? ', picked. Tap to unpick' : `, tap to pick`) : ''
                }`}
              />
            );
          }}
        />

        {!over && alive && !out ? (
          <HoldToReveal
            card={card}
            resetKey="role"
            hiddenLabel="YOUR ROLE"
            colors={{
              bg: info?.color ?? '#33405A',
              fg: '#FFFFFF',
              sub: 'rgba(255,255,255,0.85)',
              label: 'YOUR ROLE',
            }}
          />
        ) : null}

        {role === 'werewolf' ? (
          <Text variant="footnote" style={styles.hint}>
            {packLine(view, myId, nameOf)}
          </Text>
        ) : null}
        {!alive && !over ? (
          <Text variant="footnote" style={styles.hint} accessibilityLiveRegion="polite">
            You are out. You can see every role and talk with the fallen.
          </Text>
        ) : null}
        {night && alive && !job && !out ? (
          <Text variant="footnote" style={styles.hint}>
            Villagers sleep through the night.
          </Text>
        ) : null}

        {nightLine || findings.length > 0 || lines.length > 0 ? (
          <View style={styles.story}>
            {nightLine && !over ? (
              <Text variant="callout" style={{ color: ON }} accessibilityLiveRegion="polite">
                {nightLine}
              </Text>
            ) : null}
            {findings.slice(-2).map((f) => (
              <Text key={f} variant="footnote" style={{ color: '#CDBBFF' }}>
                {f}
              </Text>
            ))}
            {lines.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={storyOpen ? 'Hide the story so far' : 'Show the story so far'}
                accessibilityState={{ expanded: storyOpen }}
                onPress={() => setStoryOpen((o) => !o)}
                style={styles.storyBtn}
              >
                <Text variant="footnote" style={{ color: '#FFD27A' }}>
                  {storyOpen ? 'Hide the story so far' : 'The story so far'}
                </Text>
              </Pressable>
            ) : null}
            {storyOpen
              ? lines.map((l) => (
                  <Text key={l} variant="footnote" style={{ color: ON_DIM }}>
                    {l}
                  </Text>
                ))
              : null}
          </View>
        ) : null}

        <TalkBox chats={chats} talk={talk} nameOf={nameOf} onSend={p.onChat} />
      </ScrollView>

      <Notice text={refusal} />

      {view.phase === 'vote' && stage.action === 'vote' && !out ? (
        <View style={styles.strip}>
          <TokenButton
            label="Skip vote"
            tone="chip"
            disabled={sending}
            accessibilityLabel="Skip the vote: nobody is banished by you"
            onPress={() => send({ kind: 'vote', target: null })}
          />
        </View>
      ) : null}

      <Dock
        avatar={me?.avatar}
        name={nameOf(myId)}
        headline={out ? 'You left this game' : stage.headline}
        sub={out ? '' : subLine(stage.sub, picked, nameOf, night && job ? job.verb : null)}
      >
        {!out && stage.action === 'night' && job && !job.done ? (
          <TokenButton
            label={job.verb}
            tone={ACTION_TONE[job.kind]}
            disabled={sending || !picked}
            accessibilityLabel={
              picked ? `${job.verb} ${nameOf(picked)}` : `${job.verb}. Pick a player first`
            }
            onPress={() => picked && send({ kind: job.kind, target: picked })}
          />
        ) : null}
        {!out && stage.action === 'ready' ? (
          <TokenButton
            label="Ready to vote"
            tone="ember"
            disabled={sending}
            onPress={() => send({ kind: 'ready' })}
          />
        ) : null}
        {!out && stage.action === 'vote' ? (
          <TokenButton
            label="Vote"
            tone="ember"
            disabled={sending || !picked}
            accessibilityLabel={
              picked ? `Vote to banish ${nameOf(picked)}` : 'Vote. Pick a player first'
            }
            onPress={() => picked && send({ kind: 'vote', target: picked })}
          />
        ) : null}
      </Dock>

      {over ? (
        <ResultsPanel
          space={space}
          live={live}
          myId={myId}
          nameOf={nameOf}
          title={
            view.winner === 'draw'
              ? 'A draw'
              : view.winner === 'villagers'
                ? 'Villagers win'
                : 'Werewolves win'
          }
          sub={winnerLine(view)}
          onContinue={p.onContinue}
          story={
            <View style={styles.resultStory}>
              {view.roles
                ? view.players.map((id) => {
                    const r: WerewolfRole | undefined = view.roles?.[id];
                    return r ? (
                      <Text key={id} variant="footnote" style={{ color: ON }}>
                        {nameOf(id)}: {ROLE_INFO[r].label}
                      </Text>
                    ) : null;
                  })
                : null}
            </View>
          }
        />
      ) : null}
      {leave.open ? <LeaveSheet space={space} onLeave={p.onForfeit} onStay={leave.hide} /> : null}
    </Scene>
  );
}

/** What the dock says under the headline: the prompt, or the choice you have lined up. */
function subLine(
  sub: string,
  picked: string | null,
  nameOf: (id: string) => string,
  verb: string | null,
): string {
  if (!picked) return sub;
  return verb ? `${verb}: ${nameOf(picked)}` : `Your pick: ${nameOf(picked)}`;
}

function Ground({ w, h, night }: { w: number; h: number; night: boolean }) {
  return (
    <Svg width={w} height={h}>
      <Ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2 - 30}
        ry={h / 2 - 40}
        fill={night ? '#1A140C' : '#3A3A2A'}
        opacity={0.95}
      />
      <Ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2 - 70}
        ry={h / 2 - 70}
        fill={night ? 'rgba(255,140,60,0.16)' : 'rgba(255,220,150,0.12)'}
      />
    </Svg>
  );
}

function Campfire({ lit }: { lit: boolean }) {
  return (
    <View
      aria-hidden
      style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Path d="M12 52 L52 40" stroke="#5A3418" strokeWidth={8} strokeLinecap="round" />
        <Path d="M12 40 L52 52" stroke="#6B3E1C" strokeWidth={8} strokeLinecap="round" />
        {lit ? (
          <>
            <Path
              d="M32 8 C42 22 46 30 40 42 C37 47 27 47 24 42 C18 32 26 22 32 8 Z"
              fill="#FF5A1F"
            />
            <Path
              d="M32 22 C38 30 39 36 35 42 C33 45 29 45 28 42 C25 36 29 30 32 22 Z"
              fill="#FFB020"
            />
          </>
        ) : (
          <Path
            d="M32 28 C36 34 36 38 33 41 C31 43 29 43 28 41 C26 38 28 34 32 28 Z"
            fill="#FFB020"
            opacity={0.7}
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  tagRow: { paddingTop: 6 },
  body: { paddingTop: 8, paddingBottom: 8, gap: 10 },
  hint: { color: ON_DIM, textAlign: 'center', paddingHorizontal: 24 },
  story: {
    marginHorizontal: 12,
    padding: 12,
    gap: 4,
    borderRadius: 18,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  storyBtn: { minHeight: 44, justifyContent: 'center' },
  strip: { flexDirection: 'row', justifyContent: 'center', marginBottom: 6 },
  resultStory: { gap: 2, paddingBottom: 6 },
});
