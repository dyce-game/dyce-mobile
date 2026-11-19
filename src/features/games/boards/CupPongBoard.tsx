import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { CupPongCup } from '@dyce/games';
import type { MatchPlayer } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { CupPongControls } from './CupPongControls';
import { CupPongScene, type Playback } from './CupPongScene';
import { Canvas } from './r3f';
import {
  canRerack,
  cupsLeft,
  cupsLine,
  hasPlayed,
  inputFromDrag,
  markPlayed,
  otherPlayer,
  predictThrow,
  replayThrow,
  sampleTrace,
  tableOwner,
  throwCopy,
  toInput,
  turnLine,
  type CupPongThrow,
  type CupPongView,
  type Point,
  type ThrowTone,
} from './cup-pong-logic';

export type CupPongAction = { kind: 'throw'; aim: number; power: number } | { kind: 'rerack' };

/** The table is a fixed dark room in both themes (design: PlayCupPong and PlayCupPongDark are the same). */
const INK = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.78)';
const GLASS = 'rgba(0,0,0,0.38)';
const GLASS_EDGE = 'rgba(255,255,255,0.14)';
const ROOM = '#170C1C';
const TONE_FILL: Record<ThrowTone, string> = { hit: '#17834F', rim: '#A86F12', miss: '#44364B' };

/** How long the finished throw stays on the table before the next thing happens. */
const HOLD_MINE_MS = 500;
const HOLD_THEIRS_MS = 1000;
/** A throw takes about a second; if the canvas has not said it finished after this, carry on. */
const WATCHDOG_MS = 5000;

/** One throw being shown: the cups it was thrown at, and what the screen is waiting for. */
type Anim = {
  kind: 'mine' | 'theirs';
  token: number;
  /** The cups the ball is thrown at (before the throw). */
  pre: CupPongCup[];
  /** What the animation currently predicts. */
  predictedSunk: number | null;
  /** The server's seq before my throw (mine) so its answer can be told from the old state. */
  baseSeq: number;
  /** The server's result is in (always true for a replay). */
  confirmed: boolean;
  /** The ball has finished its path. */
  ended: boolean;
};

type Banner = { text: string; tone: ThrowTone; id: number };

/**
 * Cup Pong as a play surface: a 3D table seen from the thrower's end (React Three Fiber), the opponent
 * chip, your cup count, the balls left in the turn and re-rack. You flick up from the ball to throw (how far
 * sets the power, sideways the aim), or use the Aim and Power sliders. The device only sends `{aim, power}`;
 * it predicts the throw with the shared simulation and, when the server's answer differs (it adds a release
 * wobble from the seeded RNG), the ball is corrected to the server's path. The opponent's throw is replayed
 * from the stored input.
 */
export function CupPongBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: {
  matchId: string;
  view: CupPongView;
  players: MatchPlayer[];
  myId: string | null;
  yourTurn: boolean;
  busy: boolean;
  /** The last move was refused or never arrived. */
  moveFailed: boolean;
  onMove: (action: CupPongAction) => void;
  /** The last throw has been shown (the host may move on to the result). */
  onSettled?: () => void;
}) {
  const reduce = useReducedMotion();
  const me = myId ?? view.players[0];
  const oppId = otherPlayer(view, me);
  const nameOf = useCallback(
    (id: string) => {
      const p = players.find((x) => x.userId === id);
      return p?.displayName || p?.username || 'Them';
    },
    [players],
  );
  const oppName = nameOf(oppId);
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [anim, setAnim] = useState<Anim | null>(null);
  const [wake, setWake] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [sliders, setSliders] = useState(false);
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(540);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const playbackRef = useRef<Playback | null>(null);
  const tokenRef = useRef(0);
  const latest = useRef({ anim, size });
  latest.current = { anim, size };
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const canThrow = yourTurn && !view.over && !anim && !busy;
  const canThrowRef = useRef(canThrow);
  canThrowRef.current = canThrow && !sliders;

  // ---- starting and correcting a throw's animation --------------------------------------------------

  const begin = useCallback((trace: readonly Point[], durationMs: number, sunk: boolean) => {
    const token = ++tokenRef.current;
    playbackRef.current = {
      trace,
      startedAt: performance.now(),
      endMs: durationMs,
      sunk,
      blend: null,
      done: false,
      token,
    };
    setWake((w) => w + 1);
    return token;
  }, []);

  const show = useCallback(
    (last: CupPongThrow) => {
      const c = throwCopy(last, myId, nameOf);
      setBanner({ ...c, id: last.seq });
    },
    [myId, nameOf],
  );

  const onPlaybackEnd = useCallback((token: number) => {
    setAnim((a) => (a && a.token === token ? { ...a, ended: true } : a));
  }, []);

  function throwBall(aimV: number, powerV: number) {
    if (!canThrow) return;
    const input = toInput(aimV, powerV);
    const pre = view.racks[oppId] ?? [];
    setBanner(null);
    sawBusy.current = false;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (reduce) {
      setAnim({
        kind: 'mine',
        token: -1,
        pre,
        predictedSunk: null,
        baseSeq: view.seq,
        confirmed: false,
        ended: true,
      });
    } else {
      const p = predictThrow(pre, input);
      const token = begin(p.trace, p.durationMs, p.sunk !== null);
      setAnim({
        kind: 'mine',
        token,
        pre,
        predictedSunk: p.sunk,
        baseSeq: view.seq,
        confirmed: false,
        ended: false,
      });
    }
    onMove({ kind: 'throw', aim: input.aim, power: input.power });
  }

  // Watchdog: if the canvas never reports the end of a throw (no WebGL, app in the background), carry on
  // anyway so the game can never get stuck behind its own animation.
  const animToken = anim?.token;
  const animEnded = anim?.ended;
  const animConfirmed = anim?.confirmed;
  useEffect(() => {
    if (animToken === undefined || animEnded) return;
    const id = setTimeout(() => {
      setAnim((a) => (a && a.token === animToken ? { ...a, ended: true } : a));
    }, WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [animToken, animEnded, animConfirmed]);

  // The server's answer to my throw: keep the animation if it agrees, correct it if it does not.
  useEffect(() => {
    const last = view.last;
    if (!anim || anim.kind !== 'mine' || anim.confirmed) return;
    if (!last || last.by !== myId || last.seq <= anim.baseSeq) return;
    let ended = anim.ended;
    let predictedSunk = anim.predictedSunk;
    if (!reduce && last.sunk !== anim.predictedSunk) {
      const auth = predictThrow(anim.pre, last.applied);
      predictedSunk = auth.sunk;
      const now = performance.now();
      const current = playbackRef.current;
      const midAir = current && !current.done;
      const from = midAir ? sampleTrace(current.trace, now - current.startedAt) : null;
      playbackRef.current = {
        trace: auth.trace,
        startedAt: midAir ? current.startedAt : now,
        endMs: auth.durationMs,
        sunk: auth.sunk !== null,
        blend: from ? { from, startedAt: now, ms: 160 } : null,
        done: false,
        token: anim.token,
      };
      ended = false;
      setWake((w) => w + 1);
    }
    setAnim({ ...anim, confirmed: true, ended, predictedSunk });
  }, [anim, view.last, myId, reduce]);

  // The move never went through: put the ball back. (Only once this throw's request has been seen in
  // flight: an error left over from an earlier move must not cancel a new throw.)
  const sawBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      sawBusy.current = true;
      return;
    }
    if (moveFailed && sawBusy.current && anim && anim.kind === 'mine' && !anim.confirmed) {
      sawBusy.current = false;
      playbackRef.current = null;
      setAnim(null);
    }
  }, [busy, moveFailed, anim]);

  // Their throw (or one made on another device): replay it from the stored input, once.
  const lastSeq = view.last?.seq ?? 0;
  useEffect(() => {
    const last = view.last;
    if (!last || anim || hasPlayed(matchId, last.seq)) return;
    if (last.by === myId) {
      markPlayed(matchId, last.seq);
      onSettledRef.current?.();
      return;
    }
    const replay = reduce ? null : replayThrow(view);
    if (!replay) {
      markPlayed(matchId, last.seq);
      show(last);
      onSettledRef.current?.();
      return;
    }
    const { prediction } = replay;
    setBanner(null);
    const token = begin(prediction.trace, prediction.durationMs, prediction.sunk !== null);
    setAnim({
      kind: 'theirs',
      token,
      pre: replay.rack,
      predictedSunk: prediction.sunk,
      baseSeq: last.seq - 1,
      confirmed: true,
      ended: false,
    });
  }, [lastSeq, anim, matchId, myId, reduce]);

  // The ball has landed (and the server agrees): say what happened, let it sit, then show the table as it is.
  useEffect(() => {
    if (!anim || !anim.confirmed || !anim.ended) return;
    const last = view.last;
    if (last) show(last);
    if (Platform.OS !== 'web' && last?.by === myId && last.sunk !== null) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const id = setTimeout(
      () => {
        if (last) markPlayed(matchId, last.seq);
        playbackRef.current = null;
        setAnim(null);
        onSettledRef.current?.();
      },
      reduce ? 0 : anim.kind === 'theirs' ? HOLD_THEIRS_MS : HOLD_MINE_MS,
    );
    return () => clearTimeout(id);
  }, [anim, view.last, matchId, myId, reduce, show]);

  // Re-rack is on your own cups, which are not on screen on your turn: say it happened.
  const rerackedRef = useRef(view.rerackUsed[me] === true);
  useEffect(() => {
    const now = view.rerackUsed[me] === true;
    if (now && !rerackedRef.current) {
      setBanner({ text: 'Your cups were re-racked', tone: 'hit', id: -view.seq });
    }
    rerackedRef.current = now;
  }, [view.rerackUsed, view.seq, me]);

  // The banner fades after a few seconds.
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  // ---- what is on the table ---------------------------------------------------------------------------

  const owner = anim ? (anim.kind === 'mine' ? oppId : me) : tableOwner(view, myId);
  const shownCups = anim ? anim.pre : (view.racks[owner] ?? []);
  const myCups = cupsLeft(view, me);
  const oppCups = cupsLeft(view, oppId);

  // ---- aiming ------------------------------------------------------------------------------------------

  const dragInput = drag ? inputFromDrag(drag.dx, drag.dy, latest.current.size) : null;
  const aimInput = sliders && canThrow ? toInput(aim, power) : dragInput;
  const guide = useMemo<Point[]>(() => {
    if (!aimInput) return [];
    const p = predictThrow(view.racks[oppId] ?? [], aimInput);
    // Only the first stretch of the flight: enough to judge the line, not to read the landing.
    return p.trace.slice(1, Math.ceil(p.trace.length * 0.45));
  }, [aimInput, view.racks, oppId]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canThrowRef.current,
      onMoveShouldSetPanResponder: () => canThrowRef.current,
      onPanResponderGrant: () => setDrag({ dx: 0, dy: 0 }),
      onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: -g.dy }),
      onPanResponderRelease: (_, g) => {
        setDrag(null);
        const input = inputFromDrag(g.dx, -g.dy, latest.current.size);
        if (input) throwRef.current(input.aim, input.power);
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;
  const throwRef = useRef(throwBall);
  throwRef.current = throwBall;

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // ---- HUD ---------------------------------------------------------------------------------------------

  const line = turnLine(view, myId, oppName);
  const hint = view.over
    ? 'Game over'
    : anim?.kind === 'mine'
      ? 'Throwing…'
      : yourTurn
        ? sliders
          ? 'Set aim and power, then throw'
          : 'Flick up to throw'
        : `${oppName} is throwing`;
  const rerackOk = canThrow && canRerack(view, me);
  const dots = view.over ? 0 : view.ballsPerTurn;
  const filled = view.over ? 0 : view.ballsLeft;
  const tableLabel =
    owner === me
      ? `Cup pong table seen from ${oppName}'s end. ${myCups} of your cups left.`
      : `Cup pong table seen from your end. ${oppCups} of ${oppName}'s cups left.`;

  return (
    <View style={styles.stage} onLayout={onLayout}>
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={tableLabel}
      >
        <Canvas frameloop="demand" gl={{ antialias: true }}>
          <CupPongScene
            cups={shownCups}
            snapKey={owner}
            playbackRef={playbackRef}
            playToken={wake}
            ballAtRest={yourTurn && !view.over && !(anim && anim.kind === 'theirs')}
            guide={guide}
            onPlaybackEnd={onPlaybackEnd}
          />
        </Canvas>
      </View>

      {/* the flick surface */}
      <View style={[StyleSheet.absoluteFill, styles.touch]} {...pan.panHandlers} />

      <View style={styles.top} pointerEvents="box-none">
        <View
          accessible
          accessibilityLabel={`${oppName}. ${cupsLine(oppCups)}. ${line.text}`}
          style={[styles.chip, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
        >
          {opp ? <UserAvatar avatar={opp.avatar} name={oppName} size={36} /> : null}
          <View style={styles.chipText}>
            <Text variant="callout" color={INK} numberOfLines={1}>
              {oppName}
            </Text>
            <Text variant="footnote" color={SOFT} numberOfLines={1}>
              {cupsLine(oppCups)} · {line.mine ? 'your throw' : view.over ? 'done' : 'watching'}
            </Text>
          </View>
        </View>
        {!view.over ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              sliders ? 'Use the flick to throw' : 'Use sliders and a button to throw'
            }
            accessibilityState={{ selected: sliders }}
            onPress={() => setSliders((s) => !s)}
            style={[styles.toggle, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
          >
            <Text variant="footnote" color={INK}>
              {sliders ? 'Flick' : 'Sliders'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {banner ? (
        <View style={styles.bannerWrap} pointerEvents="none">
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={banner.text}
            style={[styles.banner, { backgroundColor: TONE_FILL[banner.tone] }]}
          >
            <Text variant="callout" color={INK}>
              {banner.text}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.bottom} pointerEvents="box-none">
        {sliders && !view.over && (yourTurn || anim?.kind === 'mine') ? (
          <CupPongControls
            aim={aim}
            power={power}
            onAim={setAim}
            onPower={setPower}
            canThrow={canThrow}
            onThrow={() => throwBall(aim, power)}
            onClose={() => setSliders(false)}
          />
        ) : null}
        <View style={styles.bar} pointerEvents="box-none">
          <View
            accessible
            accessibilityLabel={`Your cups: ${myCups} of 10 left`}
            style={[styles.panel, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
          >
            <Text variant="caption" color={SOFT}>
              Your cups
            </Text>
            <Text variant="title" color={INK}>
              {myCups} / 10
            </Text>
          </View>
          <View style={styles.hint} accessibilityLiveRegion="polite">
            <Text variant="callout" color={INK} style={styles.center}>
              {hint}
            </Text>
            <View
              style={styles.dots}
              accessible
              accessibilityLabel={`${filled} of ${dots} balls left this turn`}
            >
              {Array.from({ length: dots }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: i < filled ? '#FFFFFF' : 'rgba(255,255,255,0.3)' },
                  ]}
                />
              ))}
            </View>
          </View>
          <View style={styles.rerack}>
            <TokenButton
              label="Re-rack"
              tone="brass"
              disabled={!rerackOk}
              accessibilityLabel={
                rerackOk
                  ? 'Re-rack your cups into a tighter shape. Once a game.'
                  : 'Re-rack your cups. Not available now: once a game, at the start of your turn, with 2 to 6 cups left.'
              }
              onPress={() => {
                if (canThrow && rerackOk) onMove({ kind: 'rerack' });
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: ROOM, overflow: 'hidden' },
  touch: Platform.select({
    web: { userSelect: 'none', cursor: 'grab', touchAction: 'none' } as never,
    default: {},
  }),
  top: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 26,
    borderWidth: 1,
  },
  chipText: { flexShrink: 1 },
  toggle: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: { position: 'absolute', left: 0, right: 0, top: 74, alignItems: 'center' },
  banner: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 14, gap: 10 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  panel: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  hint: { flex: 1, alignItems: 'center', gap: 6, paddingBottom: 6 },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rerack: { minWidth: 104 },
});
