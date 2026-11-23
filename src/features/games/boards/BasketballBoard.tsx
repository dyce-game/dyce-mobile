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
  SOFT,
  StatPanel,
  hudStyles,
  type BannerState,
} from './r3f-common/hud';
import { makeNameOf, otherOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { useShotFlow } from './r3f-common/use-shot-flow';
import { BasketballControls } from './BasketballControls';
import { BasketballFlat } from './BasketballFlat';
import { BasketballScene } from './BasketballScene';
import {
  DEFAULT_POWER,
  aimLabel,
  chipLine,
  guidePoints,
  hintFor,
  inputFromFlick,
  isMoney,
  moverOf,
  planFromRecord,
  planShot,
  powerLabel,
  rackLine,
  replayShot,
  sampleShot,
  shotCopy,
  shotsAtRack,
  toInput,
  type BasketballView,
  type ShotPlanData,
  type ShotRecord,
} from './basketball-logic';

const ROOM = '#0E1424';
const GOLD = '#FFD24A';

/**
 * Basketball as a play surface: the hoop seen from your spot on the arc, in 3D (React Three Fiber). Flick up
 * from the ball: how far sets the power, sideways the aim; a dotted line shows the first part of the flight.
 * The Sliders switch gives Aim and Power sliders and a Shoot button. The device only sends `{aim, power}`; it
 * predicts the shot with the shared simulation and, when the server's answer differs (it adds a release
 * wobble from the seeded RNG), the ball glides onto the server's path. The opponent's shots are replayed from
 * the stored record. Without WebGL the same controls drive a flat picture of the court.
 */
export function BasketballBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<BasketballView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const me = myId && view.players.includes(myId) ? myId : view.players[0];
  const oppId = otherOf(view.players, me);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const oppName = nameOf(oppId);
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(DEFAULT_POWER);
  const [sliders, setSliders] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const slidersOn = sliders || !scene.ok;

  const flow = useShotFlow<ShotPlanData, ShotRecord>({
    matchId,
    myId,
    reduce: reduce || !scene.ok,
    busy,
    moveFailed,
    last: view.last,
    sample: sampleShot,
    authoritative: (_pred, shot) => planFromRecord(shot),
    replay: (after) => replayShot(view, myId, after),
    onShown: (shot, kind) => {
      const c = shotCopy(shot, myId, nameOf);
      setBanner({ ...c, id: shot.seq });
      if (Platform.OS !== 'web' && kind === 'mine' && shot.made) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onSettled: () => onSettledRef.current?.(),
    holdMineMs: 650,
    holdTheirsMs: 900,
  });
  const { anim } = flow;

  const canShoot = yourTurn && !view.over && !anim && !busy;
  const canShootRef = useRef(false);
  canShootRef.current = canShoot && !slidersOn;
  const mover = moverOf(view);
  const money = isMoney(view);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  function shoot(aimV: number, powerV: number) {
    if (!canShoot) return;
    const input = toInput(aimV, powerV);
    const plan = planShot(view.rack, input);
    setBanner(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flow.fire(plan, view.seq);
    onMove({ kind: 'shoot', aim: input.aim, power: input.power });
  }

  // ---- aiming ------------------------------------------------------------------------------------------

  const latest = useRef({ size });
  latest.current = { size };
  const dragInput = drag ? inputFromFlick(drag.dx, drag.dy, size) : null;
  const aimInput = slidersOn && canShoot ? toInput(aim, power) : dragInput;
  const guide = useMemo(
    () => (aimInput ? guidePoints(view.rack, aimInput) : []),
    [aimInput?.aim, aimInput?.power, view.rack],
  );

  const shootRef = useRef(shoot);
  shootRef.current = shoot;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canShootRef.current,
      onMoveShouldSetPanResponder: () => canShootRef.current,
      onPanResponderGrant: () => setDrag({ dx: 0, dy: 0 }),
      onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: -g.dy }),
      onPanResponderRelease: (_, g) => {
        setDrag(null);
        const input = inputFromFlick(g.dx, -g.dy, latest.current.size);
        if (input) shootRef.current(input.aim, input.power);
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // ---- HUD -------------------------------------------------------------------------------------------

  const hint = hintFor(view, yourTurn, oppName, slidersOn);
  const pipsOwner = mover ?? me;
  const done = shotsAtRack(view, pipsOwner, view.rack);
  const pips = Array.from({ length: view.shotsPerRack }, (_, i) => done[i] ?? null);
  const sceneLabel = `Basketball hoop seen from rack ${view.rack + 1} of ${view.racks}. ${
    money ? 'Money rack: every make is worth 2. ' : ''
  }You ${view.score[me] ?? 0} points, ${oppName} ${view.score[oppId] ?? 0}.`;

  return (
    <BoardFrame
      room={ROOM}
      sceneLabel={sceneLabel}
      sceneOk={scene.ok}
      onSceneError={scene.fail}
      onLayout={onLayout}
      touch={pan.panHandlers}
      scene={
        <BasketballScene
          rack={view.rack}
          money={money}
          playbackRef={flow.playbackRef}
          playToken={flow.wake}
          onPlaybackEnd={flow.onPlaybackEnd}
          ballAtRest={!view.over && !(anim && anim.kind === 'theirs') && (yourTurn || !!anim)}
          guide={guide.length > 0 && canShoot ? guide : []}
        />
      }
      flat={<BasketballFlat rack={view.rack} money={money} />}
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
                gestureWord="Flick"
                disabled={!scene.ok}
              />
            ) : null}
          </View>
          <View style={styles.topRow} pointerEvents="none">
            <View style={styles.half}>
              <StatPanel
                caption={mover === me ? 'YOU · SHOOTING' : 'YOU'}
                value={String(view.score[me] ?? 0)}
                label={`You: ${view.score[me] ?? 0} points`}
                accent={mover === me}
              />
            </View>
            <View style={styles.half}>
              <StatPanel
                caption={
                  mover === oppId ? `${oppName.toUpperCase()} · SHOOTING` : oppName.toUpperCase()
                }
                value={String(view.score[oppId] ?? 0)}
                label={`${oppName}: ${view.score[oppId] ?? 0} points`}
                accent={mover === oppId}
              />
            </View>
          </View>
          <View
            accessible
            accessibilityLabel={rackLine(view)}
            style={[styles.rack, money && !view.over && { backgroundColor: GOLD }]}
            pointerEvents="none"
          >
            <Text variant="footnote" color={money && !view.over ? '#2A1A00' : INK}>
              {rackLine(view)}
            </Text>
          </View>
        </View>
      }
      banner={<Banner banner={banner} top={220} />}
      bottom={
        <>
          {slidersOn && canShoot ? (
            <BasketballControls aim={aim} power={power} onAim={setAim} onPower={setPower} />
          ) : null}
          <View style={hudStyles.bar} pointerEvents="box-none">
            <View style={styles.card} accessibilityLiveRegion="polite">
              <View
                style={styles.pips}
                accessible
                accessibilityLabel={`This rack: ${pips
                  .map((p) => (p ? (p.made ? 'made' : 'missed') : 'to shoot'))
                  .join(', ')}`}
              >
                {pips.map((p, i) => (
                  <View
                    key={i}
                    style={[
                      styles.pip,
                      p === null && styles.pipLeft,
                      p?.made && { backgroundColor: '#2BB673', borderColor: '#2BB673' },
                      p && !p.made && styles.pipMiss,
                    ]}
                  >
                    {p ? (
                      <Text variant="caption" color={INK}>
                        {p.made ? (p.money ? '2' : '1') : '×'}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <Text variant="footnote" color={INK} numberOfLines={2}>
                {hint}
              </Text>
              {aimInput && canShoot ? (
                <Text variant="footnote" color={BRASS}>
                  {aimLabel(aimInput.aim)} · {powerLabel(aimInput.power)}
                </Text>
              ) : null}
            </View>
            <View style={styles.shoot}>
              <TokenButton
                label="Shoot"
                tone="brass"
                disabled={!canShoot}
                accessibilityLabel={`Shoot: aim ${aimLabel(aim)}, power ${powerLabel(power)}`}
                onPress={() => shoot(aim, power)}
              />
            </View>
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  topCol: { flex: 1, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  half: { flex: 1 },
  rack: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
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
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipLeft: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' },
  pipMiss: { borderColor: '#FF7A5C' },
  shoot: { minWidth: 104 },
});
