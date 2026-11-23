import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text as NativeText,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BoardProps } from '../registry/types';
import { Text, TokenButton } from '@dyce/ui';
import { BoardFrame } from './r3f-common/BoardFrame';
import {
  Banner,
  BRASS,
  GLASS,
  GLASS_EDGE,
  INK,
  ModeToggle,
  PlayerChip,
  SOFT,
  StatPanel,
  hudStyles,
  type BannerState,
} from './r3f-common/hud';
import { cameraPose, project, unprojectPlane } from './r3f-common/camera-math';
import { makeNameOf, otherOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { useShotFlow } from './r3f-common/use-shot-flow';
import { DartsControls } from './DartsControls';
import { DartsFlat } from './DartsFlat';
import { DARTS_CAMERA, DartsScene } from './DartsScene';
import {
  FINGER_LIFT,
  MIN_DRAG,
  checkout,
  chipLine,
  clockTarget,
  dartCopy,
  dartLabel,
  hintFor,
  hintLine,
  moverOf,
  numberSpots,
  planDart,
  readingLabel,
  replayDart,
  sampleDart,
  scoreSpoken,
  scoreText,
  toAim,
  turnScored,
  worldToBoard,
  DARTS_TURN,
  type DartPlanData,
  type DartRecord,
  type DartsView,
  type Point,
  type Target,
} from './darts-logic';

const ROOM = '#1E120A';

/**
 * Darts as a play surface: the board seen straight on in 3D (React Three Fiber). Drag on the board and the aim
 * marker follows just above your finger; let go and the dart flies. The Sliders switch gives Across and Up
 * sliders, target chips (the checkout hint first) and a Throw button. The device sends only the aim point;
 * the server adds the hand wobble and reads the board, so the dart is shown where it was aimed and glides to
 * where the server says it landed. The opponent's darts are replayed from the stored record.
 */
export function DartsBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<DartsView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const me = myId && view.players.includes(myId) ? myId : view.players[0];
  const oppId = otherOf(view.players, me);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const oppName = nameOf(oppId);
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [aim, setAim] = useState<Point>({ x: 0, y: 0 });
  const [sliders, setSliders] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const slidersOn = sliders || !scene.ok;

  const flow = useShotFlow<DartPlanData, DartRecord>({
    matchId,
    myId,
    reduce: reduce || !scene.ok,
    busy,
    moveFailed,
    last: view.last,
    sample: sampleDart,
    authoritative: (pred, shot) => planDart(shot.hit, pred.data.stuck),
    replay: (after) => replayDart(view, after),
    onShown: (shot, kind) => {
      const c = dartCopy(shot, view, myId, nameOf);
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

  const canThrow = yourTurn && !view.over && !anim && !busy;
  const mover = moverOf(view);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  // ---- what is in the board ----------------------------------------------------------------------------

  const stuck = useMemo<Point[]>(
    () => (anim ? [...anim.plan.data.stuck.map((d) => d.hit)] : view.turnDarts.map((d) => d.hit)),
    [anim, view.turnDarts],
  );

  function throwDart(p: Point) {
    if (!canThrow) return;
    const a = toAim(p.x, p.y);
    const plan = planDart(a, view.turnDarts);
    setBanner(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flow.fire(plan, view.seq);
    onMove({ kind: 'throw', x: a.x, y: a.y });
  }

  // ---- the touch surface -------------------------------------------------------------------------------

  const pose = useMemo(() => cameraPose(DARTS_CAMERA, size.width, size.height), [size]);
  const latest = useRef({ pose, size, canThrow, throwDart });
  latest.current = { pose, size, canThrow, throwDart };
  const drag = useRef<{ x0: number; y0: number; moved: number; aim: Point } | null>(null);

  const boardPoint = (x: number, y: number): Point | null => {
    const { pose: p, size: s } = latest.current;
    const w = unprojectPlane(p, x, y - FINGER_LIFT, s.width, s.height, [0, 0, 1], 0);
    return w ? toAim(worldToBoard(w[0], w[1]).x, worldToBoard(w[0], w[1]).y) : null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.canThrow,
      onMoveShouldSetPanResponder: () => latest.current.canThrow,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const y = e.nativeEvent.locationY;
        const a = boardPoint(x, y);
        drag.current = { x0: x, y0: y, moved: 0, aim: a ?? { x: 0, y: 0 } };
        if (a) setAim(a);
      },
      onPanResponderMove: (_, g) => {
        const d = drag.current;
        if (!d) return;
        d.moved = Math.max(d.moved, Math.hypot(g.dx, g.dy));
        const a = boardPoint(d.x0 + g.dx, d.y0 + g.dy);
        if (a) {
          d.aim = a;
          setAim(a);
        }
      },
      onPanResponderRelease: () => {
        const d = drag.current;
        drag.current = null;
        // A real drag throws where it ended; a tap only places the aim.
        if (d && d.moved >= MIN_DRAG) latest.current.throwDart(d.aim);
      },
      onPanResponderTerminate: () => {
        drag.current = null;
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // ---- numbers around the board, placed by the same camera as the scene --------------------------------------

  const numbers = useMemo(() => {
    const c = project(pose, [0, 0, 0], size.width, size.height);
    const r = project(pose, [0.1, 0, 0], size.width, size.height);
    if (!c || !r) return [];
    const pxPerM = (r.x - c.x) / 0.1;
    const font = Math.min(24, Math.max(9, 0.0165 * pxPerM));
    return numberSpots().map((s) => {
      const p = project(pose, [s.x, s.y, 0], size.width, size.height);
      return { n: s.n, x: p?.x ?? 0, y: p?.y ?? 0, font };
    });
  }, [pose, size]);

  // ---- HUD -------------------------------------------------------------------------------------------

  const showAim = canThrow && scene.ok ? aim : null;
  const next: Target | null = useMemo(() => {
    if (view.variant === 'clock')
      return (view.left[me] ?? 0) > 0 ? clockTarget(view.left[me] ?? 0) : null;
    return checkout(view.left[me] ?? 0, view.dartsLeft)?.[0] ?? null;
  }, [view, me]);
  const slots = Array.from({ length: DARTS_TURN }, (_, i) => view.turnDarts[i] ?? null);
  const scored = turnScored(view);
  const hint = canThrow ? hintLine(view, me) : null;
  const line =
    view.over || mover === null
      ? 'Game over'
      : mover === me
        ? view.variant === '501'
          ? `${scored} scored${hint ? ` · ${hint}` : ''}`
          : (hint ?? 'Hit the numbers in order')
        : `${oppName}'s turn`;
  const aimLine = canThrow
    ? `Aiming at: ${readingLabel(aim)}`
    : hintFor(view, yourTurn, oppName, slidersOn);
  const sceneLabel = `Dartboard seen straight on. You: ${scoreSpoken(view, me)}. ${oppName}: ${scoreSpoken(view, oppId)}. ${view.turnDarts.length} of ${DARTS_TURN} darts thrown this turn.`;

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
        <DartsScene
          stuck={stuck}
          playbackRef={flow.playbackRef}
          playToken={flow.wake}
          onPlaybackEnd={flow.onPlaybackEnd}
          aim={showAim}
          ready={canThrow}
        />
      }
      flat={<DartsFlat darts={stuck} aim={canThrow ? aim : null} />}
      overlay={
        scene.ok ? (
          <View
            style={StyleSheet.absoluteFill}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {numbers.map((s) => (
              <NativeText
                key={s.n}
                allowFontScaling={false}
                style={[
                  styles.num,
                  {
                    left: s.x - 16,
                    top: s.y - s.font * 0.7,
                    height: s.font * 1.4,
                    lineHeight: s.font * 1.4,
                    fontSize: s.font,
                  },
                ]}
              >
                {s.n}
              </NativeText>
            ))}
          </View>
        ) : null
      }
      top={
        <View style={styles.topCol} pointerEvents="box-none">
          <View style={styles.topRow} pointerEvents="box-none">
            <PlayerChip
              player={opp}
              name={oppName}
              line={chipLine(view, myId, oppId)}
              label={`${oppName}. ${chipLine(view, myId, oppId)}`}
              highlight={mover === oppId}
            />
            {!view.over ? (
              <ModeToggle
                sliders={slidersOn}
                onToggle={() => setSliders((s) => !s)}
                gestureWord="Drag"
                disabled={!scene.ok}
              />
            ) : null}
          </View>
          <View style={styles.topRow} pointerEvents="none">
            <View style={styles.half}>
              <StatPanel
                caption={mover === me ? 'YOU · THROWING' : 'YOU'}
                value={scoreText(view, me)}
                label={`You: ${scoreSpoken(view, me)}`}
                accent={mover === me}
              />
            </View>
            <View style={styles.half}>
              <StatPanel
                caption={
                  mover === oppId ? `${oppName.toUpperCase()} · THROWING` : oppName.toUpperCase()
                }
                value={scoreText(view, oppId)}
                label={`${oppName}: ${scoreSpoken(view, oppId)}`}
                accent={mover === oppId}
              />
            </View>
          </View>
        </View>
      }
      banner={<Banner banner={banner} top={178} />}
      bottom={
        <>
          {slidersOn && canThrow ? (
            <DartsControls aim={aim} onAim={(p) => setAim(toAim(p.x, p.y))} suggested={next} />
          ) : null}
          <View style={hudStyles.bar} pointerEvents="box-none">
            <View
              accessible
              accessibilityLabel={`This turn: ${slots.map((d) => (d ? dartLabel(d) : 'not thrown')).join(', ')}. ${line}`}
              style={styles.turnCard}
            >
              <Text variant="caption" color={SOFT}>
                {mover === me || mover === null ? 'THIS TURN' : 'THEIR TURN'}
                {view.variant === '501' ? ` · ${view.left[me] ?? 0}` : ''}
              </Text>
              <View style={styles.chips}>
                {slots.map((d, i) => (
                  <View
                    key={i}
                    style={[styles.slot, d ? { backgroundColor: slotColor(d) } : styles.slotEmpty]}
                  >
                    {d ? (
                      <Text
                        variant="callout"
                        color={d.ring === 'single' || d.ring === 'bull' ? '#1B140F' : INK}
                      >
                        {d.bust ? 'Bust' : dartLabel(d)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <Text
                variant="footnote"
                color={INK}
                numberOfLines={2}
                accessibilityLiveRegion="polite"
              >
                {line}
              </Text>
              <Text variant="footnote" color={BRASS} numberOfLines={1}>
                {aimLine}
              </Text>
            </View>
            <View style={styles.throw}>
              <TokenButton
                label="Throw"
                tone="brass"
                disabled={!canThrow}
                accessibilityLabel={`Throw the dart at ${readingLabel(aim)}`}
                onPress={() => throwDart(aim)}
              />
            </View>
          </View>
        </>
      }
    />
  );
}

const slotColor = (d: DartRecord): string =>
  d.bust
    ? '#B3361A'
    : d.ring === 'triple' || d.ring === 'double' || d.ring === 'dbull'
      ? '#C62828'
      : d.ring === 'miss'
        ? '#44364B'
        : '#EFE3C2';

const styles = StyleSheet.create({
  topCol: { flex: 1, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  half: { flex: 1 },
  num: {
    position: 'absolute',
    width: 32,
    textAlign: 'center',
    color: '#EDE6D6',
    fontWeight: '800',
  },
  turnCard: {
    flex: 1,
    gap: 6,
    padding: 10,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  chips: { flexDirection: 'row', gap: 6 },
  slot: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' },
  throw: { minWidth: 104 },
});
