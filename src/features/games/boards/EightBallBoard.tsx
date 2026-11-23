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
import type { BoardProps } from '../registry/types';
import { Text, TokenButton } from '@dyce/ui';
import { BoardFrame } from './r3f-common/BoardFrame';
import {
  Banner,
  GLASS,
  GLASS_EDGE,
  INK,
  ModeToggle,
  PlayerChip,
  SOFT,
  hudStyles,
  type BannerState,
} from './r3f-common/hud';
import { cameraPose, project, unproject } from './r3f-common/camera-math';
import { makeNameOf, otherOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { useShotFlow } from './r3f-common/use-shot-flow';
import { CallPocketRow, EightBallSliders, PowerBar, SpinPad } from './EightBallControls';
import { EightBallFlat } from './EightBallFlat';
import { EIGHT_BALL_CAMERA, EightBallScene } from './EightBallScene';
import {
  BALL_R_M,
  DMM,
  aimGuide,
  angleBetween,
  ballWorld,
  ballsWithCue,
  chipLine,
  cueBall,
  hintLine,
  moverOf,
  onEight,
  placeBounds,
  placementFrom,
  placementOk,
  planFromRecord,
  planShot,
  powerFromPull,
  sampleShot,
  shotCopy,
  spinLabel,
  suggestPocket,
  toShot,
  turnStateLine,
  worldToTable,
  type EightBallShot,
  type EightBallView,
  type ShotPlanData,
} from './eight-ball-logic';

const ROOM = '#120C08';

/**
 * 8 Ball as a play surface: a 3D table seen from the head end (React Three Fiber). Drag on the table to aim;
 * pull back from the cue ball and let go to shoot; the Spin button sets where the tip strikes. The Sliders
 * switch gives Angle, Power and Spin sliders and a Shoot button for anyone who cannot or would rather not drag.
 * The device only sends the engine's integers (angle, power, spin, and `place` / `call` when they apply), and
 * predicts the shot with the same simulation the server runs. The opponent's shot is replayed from the stored
 * record. Without WebGL the same controls drive a flat picture of the table.
 */
export function EightBallBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<EightBallView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const me = myId && view.players.includes(myId) ? myId : view.players[0];
  const oppId = otherOf(view.players, me);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const oppName = nameOf(oppId);
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(500);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const [spinOpen, setSpinOpen] = useState(false);
  const [sliders, setSliders] = useState(false);
  const [call, setCall] = useState<number | null>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pull, setPull] = useState<number | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const slidersOn = sliders || !scene.ok;

  // ---- the shot life cycle -------------------------------------------------------------------------

  const flow = useShotFlow<ShotPlanData, EightBallShot>({
    matchId,
    myId,
    reduce: reduce || !scene.ok,
    busy,
    moveFailed,
    last: view.last,
    sample: sampleShot,
    authoritative: (_pred, shot) => planFromRecord(shot),
    replay: (after) =>
      view.last && view.last.seq > after
        ? { shot: view.last, plan: planFromRecord(view.last) }
        : null,
    onShown: (shot, kind) => {
      const c = shotCopy(shot, view, myId, nameOf);
      setBanner({ ...c, id: shot.seq });
      if (Platform.OS !== 'web' && kind === 'mine') {
        void Haptics.notificationAsync(
          c.tone === 'foul'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        );
      }
    },
    onSettled: () => onSettledRef.current?.(),
    holdMineMs: 700,
  });
  const { anim } = flow;

  const canShoot = yourTurn && !view.over && !anim && !busy;
  const needsPlace = canShoot && view.hand !== 'none';

  // A new turn with the ball in hand starts in placing mode; a turn without it never has a placement.
  const turnKey = `${view.seq}:${view.hand}:${yourTurn}`;
  useEffect(() => {
    setPlace(null);
    setPlacing(yourTurn && !view.over && view.hand !== 'none');
    setSpinOpen(false);
  }, [turnKey]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 5000);
    return () => clearTimeout(id);
  }, [banner]);

  // ---- what is on the table --------------------------------------------------------------------------

  const restBalls = useMemo(
    () => ballsWithCue(view.balls, needsPlace ? place : null),
    [view.balls, needsPlace, place],
  );
  const shownBalls = anim ? anim.plan.data.from : restBalls;
  const myOnEight = onEight(view, me);
  const calledPocket = myOnEight ? (call ?? suggestPocket(view.balls)) : null;
  const placeOk = place ? placementOk(view.balls, place, view.hand) : true;
  const aiming = canShoot && !placing;
  const guide = useMemo(
    () => (aiming ? aimGuide(restBalls, angle) : null),
    [aiming, restBalls, angle],
  );

  // ---- shooting ------------------------------------------------------------------------------------

  const shoot = useCallback(
    (angleV: number, powerV: number) => {
      if (!canShoot || placing) return;
      if (view.hand !== 'none' && place && !placeOk) {
        setBanner({ text: 'Pick another spot for the cue ball', tone: 'foul', id: -view.seq });
        return;
      }
      const input = toShot(angleV, powerV, spin.x, spin.y);
      const placeNow = view.hand !== 'none' ? place : null;
      const plan = planShot(ballsWithCue(view.balls, placeNow), input);
      setBanner(null);
      setSpinOpen(false);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      flow.fire(plan, view.seq);
      onMove({
        kind: 'shoot',
        ...input,
        ...(placeNow ? { place: placeNow } : {}),
        ...(myOnEight ? { call: { pocket: calledPocket ?? 5 } } : {}),
      });
    },
    [canShoot, placing, view, place, placeOk, spin, myOnEight, calledPocket, flow.fire, onMove],
  );

  // ---- the touch surface -------------------------------------------------------------------------------

  const pose = useMemo(() => cameraPose(EIGHT_BALL_CAMERA, size.width, size.height), [size]);
  const latest = useRef({ pose, size, view, restBalls, canShoot, placing, shoot });
  latest.current = { pose, size, view, restBalls, canShoot, placing, shoot };
  const gesture = useRef<{
    mode: 'aim' | 'pull' | 'place';
    x0: number;
    y0: number;
    angle: number | null;
    power: number | null;
  } | null>(null);

  const tablePoint = (x: number, y: number) => {
    const { pose: p, size: s } = latest.current;
    const w = unproject(p, x, y, s.width, s.height, BALL_R_M);
    return w ? worldToTable(w[0], w[2]) : null;
  };

  const applyTouch = (x: number, y: number, mode: 'aim' | 'pull' | 'place') => {
    const { pose: p, size: s, view: v, restBalls: balls } = latest.current;
    const at = tablePoint(x, y);
    if (!at) return;
    if (mode === 'place') {
      const spot = placementFrom(at.x, at.y, v.hand);
      setPlace(spot);
      return;
    }
    const cue = cueBall(balls);
    const cueMm = { x: cue.x / DMM, y: cue.y / DMM };
    if (mode === 'aim') {
      const a = angleBetween(cueMm, at);
      if (a !== null) {
        if (gesture.current) gesture.current.angle = a;
        setAngle(a);
      }
      return;
    }
    // Pull back: the shot goes from the finger towards the cue ball; how far back is the power.
    const a = angleBetween(at, cueMm);
    const cs = project(p, ballWorld(cue), s.width, s.height);
    const pt = cs ? Math.hypot(x - cs.x, y - cs.y) : 0;
    const pw = powerFromPull(pt);
    if (a !== null) {
      setAngle(a);
      if (gesture.current) gesture.current.angle = a;
    }
    if (pw !== null) {
      setPower(pw);
      if (gesture.current) gesture.current.power = pw;
    }
    setPull(pw);
    if (gesture.current && pw === null) gesture.current.power = null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.canShoot,
      onMoveShouldSetPanResponder: () => latest.current.canShoot,
      onPanResponderGrant: (e) => {
        const { pose: p, size: s, restBalls: balls, placing: pl } = latest.current;
        const x = e.nativeEvent.locationX;
        const y = e.nativeEvent.locationY;
        let mode: 'aim' | 'pull' | 'place' = 'aim';
        if (pl) mode = 'place';
        else {
          const cs = project(p, ballWorld(cueBall(balls)), s.width, s.height);
          if (cs && Math.hypot(x - cs.x, y - cs.y) <= 52) mode = 'pull';
        }
        gesture.current = { mode, x0: x, y0: y, angle: null, power: null };
        if (mode !== 'pull') applyTouch(x, y, mode);
      },
      onPanResponderMove: (_, g) => {
        const m = gesture.current;
        if (!m) return;
        applyTouch(m.x0 + g.dx, m.y0 + g.dy, m.mode);
      },
      onPanResponderRelease: () => {
        const m = gesture.current;
        gesture.current = null;
        setPull(null);
        if (m && m.mode === 'pull' && m.power !== null && m.angle !== null) {
          latest.current.shoot(m.angle, m.power);
        }
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
        setPull(null);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // ---- HUD -------------------------------------------------------------------------------------------

  const hint = hintLine(view, yourTurn, oppName, placing && needsPlace, slidersOn);
  const bounds = placeBounds(view.hand === 'none' ? 'anywhere' : view.hand);
  const cuePos = cueBall(restBalls);
  const sceneLabel = `Pool table seen from the head end. ${turnStateLine(view, myId)}. ${oppName}: ${chipLine(view, myId, oppId)}.${view.hand !== 'none' && yourTurn ? ' You have the cue ball in hand.' : ''}`;

  const mainButton =
    placing && needsPlace ? (
      <TokenButton
        label="Aim from here"
        tone="brass"
        disabled={!placeOk}
        accessibilityLabel={
          placeOk
            ? 'Lock the cue ball here and start aiming'
            : 'The cue ball cannot go here: it touches a ball or a pocket'
        }
        onPress={() => setPlacing(false)}
      />
    ) : (
      <TokenButton
        label="Shoot"
        tone="brass"
        disabled={!canShoot || placing}
        accessibilityLabel={`Shoot: angle ${(angle / 100).toFixed(1)} degrees, power ${Math.round(power / 10)} percent, ${spinLabel(spin.x, spin.y).toLowerCase()}`}
        onPress={() => shoot(angle, power)}
      />
    );

  return (
    <BoardFrame
      room={ROOM}
      sceneLabel={sceneLabel}
      sceneOk={scene.ok}
      onSceneError={scene.fail}
      onLayout={onLayout}
      touch={pan.panHandlers}
      cursor="crosshair"
      scene={
        <EightBallScene
          balls={shownBalls}
          playbackRef={flow.playbackRef}
          playToken={flow.wake}
          onPlaybackEnd={flow.onPlaybackEnd}
          hand={view.hand}
          guide={guide}
          cue={aiming ? { angle, pull: pull !== null ? power / 1000 : 0.12 } : null}
          placing={needsPlace && placing ? { ok: placeOk } : null}
          calledPocket={calledPocket}
        />
      }
      flat={
        <EightBallFlat
          balls={shownBalls}
          guide={guide}
          calledPocket={calledPocket}
          headLine={view.hand === 'kitchen' && needsPlace}
        />
      }
      top={
        <>
          <PlayerChip
            player={opp}
            name={oppName}
            line={chipLine(view, myId, oppId)}
            label={`${oppName}. ${chipLine(view, myId, oppId)}`}
            highlight={moverOf(view) === oppId}
          />
          {!view.over ? (
            <ModeToggle
              sliders={slidersOn}
              onToggle={() => setSliders((s) => !s)}
              gestureWord="Drag"
              disabled={!scene.ok}
            />
          ) : null}
        </>
      }
      banner={<Banner banner={banner} />}
      bottom={
        <>
          {spinOpen && canShoot && !placing ? (
            <SpinPad
              spinX={spin.x}
              spinY={spin.y}
              onSpin={(x, y) => setSpin({ x, y })}
              onClose={() => setSpinOpen(false)}
            />
          ) : null}
          {canShoot && myOnEight && !placing && calledPocket !== null ? (
            <CallPocketRow pocket={calledPocket} onChange={setCall} />
          ) : null}
          {slidersOn && canShoot ? (
            <EightBallSliders
              angle={angle}
              power={power}
              spinX={spin.x}
              spinY={spin.y}
              onAngle={setAngle}
              onPower={setPower}
              onSpin={(x, y) => setSpin(toShotSpin(x, y))}
              placing={
                needsPlace && placing
                  ? {
                      x: Math.round(cuePos.x / DMM),
                      y: Math.round(cuePos.y / DMM),
                      xMin: bounds.xMin,
                      xMax: bounds.xMax,
                      yMin: bounds.yMin,
                      yMax: bounds.yMax,
                      ok: placeOk,
                      onX: (v) => setPlace(placementFrom(v, (place ?? cuePos).y / DMM, view.hand)),
                      onY: (v) => setPlace(placementFrom((place ?? cuePos).x / DMM, v, view.hand)),
                    }
                  : null
              }
            />
          ) : null}
          <View style={hudStyles.bar} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Spin: ${spinLabel(spin.x, spin.y)}. Opens the spin pad.`}
              accessibilityState={{ expanded: spinOpen, disabled: !canShoot || placing }}
              disabled={!canShoot || placing || slidersOn}
              onPress={() => setSpinOpen((s) => !s)}
              style={[styles.spinBtn, (!canShoot || placing || slidersOn) && styles.dim]}
            >
              <View
                style={[
                  styles.spinDot,
                  { left: 20 + (spin.x / 100) * 14, top: 20 - (spin.y / 100) * 14 },
                ]}
              />
            </Pressable>
            <View style={[hudStyles.hint, styles.hintBox]} accessibilityLiveRegion="polite">
              <Text variant="footnote" color={SOFT} style={hudStyles.center}>
                {turnStateLine(view, myId)}
              </Text>
              <Text variant="callout" color={INK} style={hudStyles.center}>
                {hint}
              </Text>
              <View style={styles.power}>
                <PowerBar power={power} />
              </View>
            </View>
            <View style={styles.shoot}>{mainButton}</View>
          </View>
        </>
      }
    />
  );
}

/** Spin from the sliders stays inside the circle the engine allows. */
function toShotSpin(x: number, y: number): { x: number; y: number } {
  const t = toShot(0, 0, x, y);
  return { x: t.spinX, y: t.spinY };
}

const styles = StyleSheet.create({
  spinBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F2EEE6',
    borderWidth: 2,
    borderColor: GLASS_EDGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.45 },
  spinDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C93E1C',
  },
  hintBox: { backgroundColor: GLASS, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  power: { alignSelf: 'stretch', paddingHorizontal: 4 },
  shoot: { minWidth: 112 },
});
