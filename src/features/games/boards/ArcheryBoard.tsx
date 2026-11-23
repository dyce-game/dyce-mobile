import { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from 'react-native';
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
  StatPanel,
  hudStyles,
  type BannerState,
} from './r3f-common/hud';
import { cameraPose, unprojectPlane } from './r3f-common/camera-math';
import { makeNameOf, otherOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { useShotFlow } from './r3f-common/use-shot-flow';
import { ArcheryControls } from './ArcheryControls';
import { ArcheryFlat } from './ArcheryFlat';
import { ArcheryScene } from './ArcheryScene';
import {
  ARCHERY_CAMERA,
  DISTANCE_M,
  DRAW_MAX,
  aimXLabel,
  aimYLabel,
  arrowCopy,
  arrowLabel,
  arrowsOnTarget,
  chipLine,
  compensation,
  currentWind,
  dragAim,
  drawLabel,
  endLine,
  hintFor,
  moverOf,
  planFromRecord,
  predictArrow,
  replayArrow,
  ringColors,
  sampleArrow,
  toInput,
  windWords,
  type ArcheryView,
  type ArrowPlanData,
  type ArrowRecord,
} from './archery-logic';

const ROOM = '#9ED0EE';
/** The sight moves this much of the finger's travel, so a long lens can be aimed finely. */
const DRAG_GAIN = 0.6;

/**
 * Archery as a play surface: the target at 30 m through a long lens, in 3D (React Three Fiber). Drag on the
 * range to move the sight pin; press Release to shoot. The wind row says which way and how hard it blows,
 * and "Allow for wind" moves the sight to cancel it at the current draw. The Sliders switch adds Across and
 * Up sliders for the sight. The device only sends `{aimX, aimY, draw}`; the server adds a hand tremor, so the
 * arrow is shown where the device expects it and glides to where the server says it landed. The opponent's
 * arrows are replayed from the stored record.
 */
export function ArcheryBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<ArcheryView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const me = myId && view.players.includes(myId) ? myId : view.players[0];
  const oppId = otherOf(view.players, me);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const oppName = nameOf(oppId);
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [draw, setDraw] = useState(DRAW_MAX);
  const [sliders, setSliders] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const slidersOn = sliders || !scene.ok;

  const flow = useShotFlow<ArrowPlanData, ArrowRecord>({
    matchId,
    myId,
    reduce: reduce || !scene.ok,
    busy,
    moveFailed,
    last: view.last,
    sample: sampleArrow,
    authoritative: (_pred, shot) => planFromRecord(shot),
    replay: (after) => replayArrow(view, myId, after),
    onShown: (shot, kind) => {
      const c = arrowCopy(shot, myId, nameOf);
      setBanner({ ...c, id: shot.seq });
      if (Platform.OS !== 'web' && kind === 'mine' && shot.score >= 9) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onSettled: () => onSettledRef.current?.(),
    holdMineMs: 800,
    holdTheirsMs: 1100,
  });
  const { anim } = flow;

  const canShoot = yourTurn && !view.over && !anim && !busy;
  const canShootRef = useRef(false);
  canShootRef.current = canShoot && !slidersOn;
  const mover = moverOf(view);
  const wind = currentWind(view);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  function release() {
    if (!canShoot) return;
    const input = toInput(aim.x, aim.y, draw);
    const plan = predictArrow(input, wind);
    setBanner(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flow.fire(plan, view.seq);
    onMove({ kind: 'shoot', ...input });
  }

  // ---- the touch surface -------------------------------------------------------------------------------

  const pose = useMemo(() => cameraPose(ARCHERY_CAMERA, size.width, size.height), [size]);
  /** Millimetres of the face for one point of the screen. */
  const mmPerPt = useMemo(() => {
    const a = unprojectPlane(
      pose,
      100,
      size.height / 2,
      size.width,
      size.height,
      [0, 0, 1],
      -DISTANCE_M,
    );
    const b = unprojectPlane(
      pose,
      200,
      size.height / 2,
      size.width,
      size.height,
      [0, 0, 1],
      -DISTANCE_M,
    );
    return a && b ? ((b[0] - a[0]) / 100) * 1000 * DRAG_GAIN : 4;
  }, [pose, size]);
  const latest = useRef({ aim, mmPerPt });
  latest.current = { aim, mmPerPt };
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canShootRef.current,
      onMoveShouldSetPanResponder: () => canShootRef.current,
      onPanResponderGrant: () => {
        dragFrom.current = { ...latest.current.aim };
      },
      onPanResponderMove: (_, g) => {
        const from = dragFrom.current;
        if (!from) return;
        const a = dragAim(from, g.dx, -g.dy, latest.current.mmPerPt);
        setAim(a);
      },
      onPanResponderRelease: () => {
        dragFrom.current = null;
      },
      onPanResponderTerminate: () => {
        dragFrom.current = null;
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // ---- what is on the target ---------------------------------------------------------------------------

  const hideSeq = anim?.shot?.seq ?? -1;
  const onTarget = useMemo(
    () => arrowsOnTarget(view).filter((a) => a.seq !== hideSeq),
    [view, hideSeq],
  );
  const sight = canShoot ? aim : null;

  // ---- HUD -------------------------------------------------------------------------------------------

  const hint = hintFor(view, yourTurn, oppName, slidersOn);
  const shooter = mover ?? me;
  const thisEnd = arrowsOnTarget(view).filter((a) => a.by === shooter);
  const slots = Array.from({ length: view.arrowsPerEnd }, (_, i) => thisEnd[i] ?? null);
  const windText = `Wind: ${windWords(wind)}`;
  const sceneLabel = `Archery target at 30 metres, end ${view.end + 1} of ${view.ends}. ${windText}. You ${view.score[me] ?? 0} points, ${oppName} ${view.score[oppId] ?? 0}.`;

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
        <ArcheryScene
          arrows={onTarget}
          mineId={me}
          playbackRef={flow.playbackRef}
          playToken={flow.wake}
          onPlaybackEnd={flow.onPlaybackEnd}
          sight={sight}
          windDms={wind}
        />
      }
      flat={<ArcheryFlat arrows={onTarget} mineId={me} sight={sight} />}
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
                caption={mover === me ? 'YOU · SHOOTING' : 'YOU'}
                value={String(view.score[me] ?? 0)}
                label={`You: ${view.score[me] ?? 0} points, ${view.xs[me] ?? 0} X`}
                accent={mover === me}
              />
            </View>
            <View style={styles.half}>
              <StatPanel
                caption={
                  mover === oppId ? `${oppName.toUpperCase()} · SHOOTING` : oppName.toUpperCase()
                }
                value={String(view.score[oppId] ?? 0)}
                label={`${oppName}: ${view.score[oppId] ?? 0} points, ${view.xs[oppId] ?? 0} X`}
                accent={mover === oppId}
              />
            </View>
          </View>
          <View
            accessible
            accessibilityLabel={`${endLine(view)}. ${windText}`}
            style={styles.windPill}
            pointerEvents="none"
          >
            <WindArrow dms={wind} />
            <Text variant="footnote" color={INK}>
              {endLine(view)} · {windWords(wind)}
            </Text>
          </View>
        </View>
      }
      banner={<Banner banner={banner} top={232} />}
      bottom={
        <>
          {canShoot ? (
            <ArcheryControls
              aimX={aim.x}
              aimY={aim.y}
              draw={draw}
              windDms={wind}
              showAim={slidersOn}
              onAimX={(v) => setAim((a) => ({ ...a, x: toInput(v, 0, 0).aimX }))}
              onAimY={(v) => setAim((a) => ({ ...a, y: toInput(0, v, 0).aimY }))}
              onDraw={setDraw}
              onAllowForWind={() =>
                setAim((a) => ({ ...a, x: toInput(compensation(wind, draw), 0, 0).aimX }))
              }
            />
          ) : null}
          <View style={hudStyles.bar} pointerEvents="box-none">
            <View style={styles.card} accessibilityLiveRegion="polite">
              <View
                style={styles.pips}
                accessible
                accessibilityLabel={`This end: ${slots.map((s) => (s ? `${s.score} points` : 'to shoot')).join(', ')}`}
              >
                {slots.map((s, i) => {
                  const c = s ? ringColors(s.score) : null;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.pip,
                        c ? { backgroundColor: c.fill, borderColor: c.fill } : styles.pipLeft,
                      ]}
                    >
                      {s && c ? (
                        <Text variant="callout" color={c.text}>
                          {arrowLabel(s)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <Text variant="footnote" color={INK} numberOfLines={2}>
                {hint}
              </Text>
              {canShoot ? (
                <Text variant="footnote" color={BRASS} numberOfLines={1}>
                  {aimXLabel(aim.x)} · {aimYLabel(aim.y)} · {drawLabel(draw)}
                </Text>
              ) : null}
            </View>
            <View style={styles.release}>
              <TokenButton
                label="Release"
                tone="brass"
                disabled={!canShoot}
                accessibilityLabel={`Release the arrow: sight ${aimXLabel(aim.x)} and ${aimYLabel(aim.y)}, ${drawLabel(draw)}`}
                onPress={release}
              />
            </View>
          </View>
        </>
      }
    />
  );
}

/** A small arrow showing which way the wind blows (left or right) and, by its length, how hard. */
function WindArrow({ dms }: { dms: number }) {
  const len = Math.round(10 + Math.min(1, Math.abs(dms) / 80) * 22);
  const right = dms >= 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.windArrow, { width: len, alignItems: right ? 'flex-end' : 'flex-start' }]}
    >
      <View style={[styles.windShaft, { width: len }]} />
      <View style={[styles.windHead, right ? styles.windHeadR : styles.windHeadL]} />
    </View>
  );
}

const styles = StyleSheet.create({
  topCol: { flex: 1, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  half: { flex: 1 },
  windPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  windArrow: { height: 14, justifyContent: 'center' },
  windShaft: { height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  windHead: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  windHeadR: { right: -2, borderLeftWidth: 9, borderLeftColor: '#FFFFFF' },
  windHeadL: { left: -2, borderRightWidth: 9, borderRightColor: '#FFFFFF' },
  card: {
    flex: 1,
    gap: 6,
    padding: 10,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  pips: { flexDirection: 'row', gap: 6 },
  pip: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipLeft: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' },
  release: { minWidth: 112 },
});
