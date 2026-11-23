import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { TANKS_WEAPONS, TANKS_WORLD_H, TANKS_WORLD_W } from '@dyce/games';
import { Text, TokenButton } from '@dyce/ui';
import type { BoardProps } from '../registry/types';
import { BottomBar, GLASS, GLASS_EDGE, INK, PlayerChip, SOFT, WARN } from './arcade-kit';
import { playerName } from './arcade-parse';
import {
  WEAPONS,
  ammoLeft,
  barrelTip,
  clampAngle,
  clampPower,
  damageText,
  defaultAim,
  dragToAim,
  flipY,
  frameAt,
  guideArc,
  hpAfter,
  hpColor,
  lastShotLine,
  myIndex,
  planShot,
  replayFromResult,
  sameImpacts,
  shotLine,
  tankAt,
  tanksSeen,
  terrainAfter,
  terrainPoints,
  timeline,
  weaponInfo,
  weaponLabel,
  weaponName,
  windLabel,
  windSpoken,
  type Pt,
  type TanksView,
  type Timeline,
  type Weapon,
} from './tanks-logic';
import type { TanksImpact } from '@dyce/games';

/** The field is a fixed sunset scene in both themes (design: PlayTanks and PlayTanksDark are the same). */
const ME = { turret: '#F07A4A', body: '#C93E1C', edge: '#8A2410' };
const THEM = { turret: '#6FA8F5', body: '#2457D6', edge: '#1B3F8F' };
const ASPECT = TANKS_WORLD_W / TANKS_WORLD_H;
const FLASH_MS = 420;
const FLOAT_MS = 1100;

/** One shot being shown. */
type Shot = {
  mine: boolean;
  shooter: 0 | 1;
  weapon: Weapon;
  traces: [number, number][][];
  tl: Timeline;
  impacts: TanksImpact[];
  /** The ground and health before the shot. When `exact` is false (a replay with no earlier state) they are the end state. */
  pre: { terrain: number[]; hp: [number, number] };
  post: { terrain: number[]; hp: [number, number] };
  exact: boolean;
  /** The server's `seq` when the move was sent (mine), so its answer can be told from the old state. */
  baseSeq: number;
  startedAt: number;
  confirmed: boolean;
  ended: boolean;
};

/**
 * Tanks as a play surface: two tanks on seeded, destructible ground, the wind, your health and the other
 * tank's. You aim by dragging from your tank (the barrel follows your finger, the distance is the power) or
 * with the Angle and Power buttons, pick a weapon and press Fire. The board flies the shot with the shared
 * simulation to animate it while the move is sent, and shows what the server's view says: the server's
 * ground and health win if they ever differ. The other player's shot is replayed when you open the game.
 */
export function TanksBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<TanksView>) {
  const reduce = useReducedMotion();
  const nameOf = useCallback((id: string) => playerName(players, id), [players]);
  const me = players.find((p) => p.userId === myId) ?? null;
  const mi = myIndex(view, myId);
  const oi: 0 | 1 = mi === 0 ? 1 : 0;
  const oppId = view.players[oi];
  const opp = players.find((p) => p.userId === oppId) ?? null;

  const [shot, setShot] = useState<Shot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [angle, setAngle] = useState(() => defaultAim(view, mi).angle);
  const [power, setPower] = useState(() => defaultAim(view, mi).power);
  const [weapon, setWeapon] = useState<Weapon>('shell');
  const [aiming, setAiming] = useState(false);
  const [region, setRegion] = useState({ w: 0, h: 0 });

  // A weapon you have run out of falls back to the plain shell.
  useEffect(() => {
    if (myId && ammoLeft(view, myId, weapon) === 0) setWeapon('shell');
  }, [view, myId, weapon]);

  const canFire = yourTurn && !busy && !view.over && shot === null;

  // ---- keep the state before the last move, so the other player's shot can be replayed exactly
  const seen = useRef<{ cur: TanksView; prev: TanksView | null }>({ cur: view, prev: null });
  useEffect(() => {
    if (seen.current.cur.seq !== view.seq) seen.current = { prev: seen.current.cur, cur: view };
  }, [view]);

  // ---- animation clock
  useEffect(() => {
    if (!shot || shot.ended) return;
    if (reduce) {
      setShot({ ...shot, ended: true });
      return;
    }
    let raf = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t - shot.startedAt >= shot.tl.total + FLOAT_MS) {
        setShot((s) => (s ? { ...s, ended: true } : s));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shot, reduce]);

  // The server's answer to my shot: use its ground and health (they are the truth), and note if we differed.
  useEffect(() => {
    if (!shot || !shot.mine || shot.confirmed) return;
    const l = view.last;
    if (view.seq <= shot.baseSeq || !l || l.by !== myId) return;
    const agree = sameImpacts(shot.impacts, l.impacts);
    setShot({
      ...shot,
      confirmed: true,
      post: agree ? shot.post : { terrain: view.terrain, hp: view.hp },
    });
  }, [view, shot, myId]);

  // A refused or lost move: show the board as the server has it.
  useEffect(() => {
    if (moveFailed && shot?.mine && !shot.confirmed) setShot(null);
  }, [moveFailed, shot]);

  // Shown and agreed: the view takes over.
  useEffect(() => {
    if (shot?.ended && shot.confirmed) setShot(null);
  }, [shot]);

  // ---- the other player's shot, replayed once
  const settle = useRef(onSettled);
  settle.current = onSettled;
  const lastSeq = view.last?.seq ?? 0;
  useEffect(() => {
    const l = view.last;
    if (!l || shot || tanksSeen.has(matchId, l.seq)) return;
    if (l.by === myId) {
      tanksSeen.mark(matchId, l.seq);
      settle.current?.();
      return;
    }
    if (reduce) {
      tanksSeen.mark(matchId, l.seq);
      settle.current?.();
      return;
    }
    const shooter: 0 | 1 = view.players[0] === l.by ? 0 : 1;
    const before =
      seen.current.prev && seen.current.prev.seq === l.seq - 1 ? seen.current.prev : null;
    let traces: [number, number][][] | null = null;
    let plan: ReturnType<typeof planShot> | null = null;
    if (before) {
      plan = planShot(before, shooter, l.weapon, l.angle, l.power);
      traces = plan.traces;
    } else {
      traces = replayFromResult(view);
    }
    if (!traces || traces.length === 0) {
      tanksSeen.mark(matchId, l.seq);
      settle.current?.();
      return;
    }
    setNow(Date.now());
    setShot({
      mine: false,
      shooter,
      weapon: l.weapon,
      traces,
      tl: timeline(traces),
      impacts: l.impacts,
      pre: before
        ? { terrain: before.terrain, hp: before.hp }
        : { terrain: view.terrain, hp: view.hp },
      post: { terrain: view.terrain, hp: view.hp },
      exact: !!before,
      baseSeq: l.seq - 1,
      startedAt: Date.now(),
      confirmed: true,
      ended: false,
    });
  }, [lastSeq, shot, matchId, myId, reduce]);

  // When a replay or my shot has finished, mark it shown and let the host move on.
  useEffect(() => {
    if (shot || lastSeq === 0) return;
    tanksSeen.mark(matchId, lastSeq);
    if (view.over) settle.current?.();
  }, [shot, lastSeq, view.over, matchId]);
  // A watchdog: the result is never held back for more than a few seconds.
  useEffect(() => {
    if (!view.over || lastSeq === 0) return;
    const id = setTimeout(() => {
      tanksSeen.mark(matchId, lastSeq);
      settle.current?.();
    }, 9000);
    return () => clearTimeout(id);
  }, [view.over, lastSeq, matchId]);

  // ---- firing
  const fire = () => {
    if (!canFire) return;
    const a = clampAngle(angle);
    const p = clampPower(power);
    const plan = planShot(view, mi, weapon, a, p);
    setNow(Date.now());
    setShot({
      mine: true,
      shooter: mi,
      weapon,
      traces: plan.traces,
      tl: timeline(plan.traces),
      impacts: plan.impacts,
      pre: { terrain: view.terrain, hp: view.hp },
      post: { terrain: plan.terrain, hp: plan.hp },
      exact: true,
      baseSeq: view.seq,
      startedAt: Date.now(),
      confirmed: false,
      ended: false,
    });
    onMove({ kind: 'fire', angle: a, power: p, weapon });
  };

  // ---- what is on screen right now
  const elapsed = shot ? (shot.ended ? shot.tl.total + FLOAT_MS : now - shot.startedAt) : 0;
  const frame = shot ? frameAt(shot.traces, shot.tl, elapsed) : null;
  const landed = shot ? (shot.ended ? shot.impacts.length : (frame?.landed ?? 0)) : 0;
  const terrain = shot
    ? shot.ended || !shot.exact
      ? shot.post.terrain
      : terrainAfter(shot.pre.terrain, shot.weapon, shot.impacts, landed)
    : view.terrain;
  const hp: [number, number] = shot
    ? shot.ended || !shot.exact
      ? shot.post.hp
      : hpAfter(shot.pre.hp, shot.impacts, landed)
    : view.hp;

  // ---- geometry
  const W = Math.max(160, Math.floor(Math.min(region.w - 16, (region.h - 8) * ASPECT)));
  const H = Math.round(W / ASPECT);
  const scale = W / TANKS_WORLD_W;
  const onRegion = (e: LayoutChangeEvent) =>
    setRegion({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // ---- aim by dragging from the tank
  const live = useRef({ canFire, scale, centre: tankAt(view, mi, terrain) });
  live.current = { canFire, scale, centre: tankAt(view, mi, terrain) };
  const pan = useMemo(() => {
    const aimTo = (e: GestureResponderEvent) => {
      const { scale: sc, centre } = live.current;
      const to: Pt = {
        x: e.nativeEvent.locationX / sc,
        y: TANKS_WORLD_H - e.nativeEvent.locationY / sc,
      };
      const aim = dragToAim(centre, to);
      if (aim) {
        setAngle(aim.angle);
        setPower(aim.power);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.canFire,
      onMoveShouldSetPanResponder: () => live.current.canFire,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setAiming(true);
        aimTo(e);
      },
      onPanResponderMove: (e) => aimTo(e),
      onPanResponderRelease: () => setAiming(false),
      onPanResponderTerminate: () => setAiming(false),
    });
  }, []);

  // ---- text
  const dmg = view.last ? lastShotLine(view, myId, nameOf) : null;
  const status = (() => {
    if (view.over) {
      const w = view.winner;
      return {
        title: w === null ? 'Draw' : w === myId ? 'You won' : `${nameOf(w)} won`,
        sub: dmg,
        color: SOFT,
      };
    }
    if (shot && !shot.ended)
      return {
        title: shot.mine ? 'Firing…' : `${nameOf(view.players[shot.shooter])} fires`,
        sub: windLabel(view.wind),
        color: SOFT,
      };
    if (yourTurn) {
      return {
        title: `Angle ${angle}° · power ${power}%`,
        sub: aiming
          ? 'Let go, then press Fire'
          : (dmg ? `${dmg} · ` : '') + 'Drag from your tank to aim',
        color: SOFT,
      };
    }
    return {
      title: `Waiting for ${nameOf(view.players[view.turn])}`,
      sub: dmg ?? shotLine(view, view.turn),
      color: SOFT,
    };
  })();

  const webOnly =
    Platform.OS === 'web'
      ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object)
      : null;
  const myCentre = tankAt(view, mi, terrain);
  const showGuide = canFire;
  const arc = showGuide ? guideArc(barrelTip(myCentre, angle, 16), angle, power) : [];

  const spec = TANKS_WEAPONS[weapon];

  return (
    <View style={styles.stage}>
      <View style={styles.top}>
        <View style={styles.pills}>
          <View
            style={[styles.pill, { backgroundColor: GLASS }]}
            accessible
            accessibilityLabel={windSpoken(view.wind)}
          >
            <Text variant="callout" color={INK}>
              {windLabel(view.wind)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#E3A93B' }]}>
            <Text variant="callout" color="#3A2400" numberOfLines={1}>
              {myId ? weaponLabel(view, myId, weapon) : weaponName(weapon)}
            </Text>
          </View>
        </View>
        <PlayerChip
          player={opp}
          name={nameOf(oppId)}
          line={`${nameOf(oppId)} · ${view.hp[oi]} hp · ${view.turn === oi && !view.over ? 'aiming' : 'waiting'}`}
        />
      </View>

      <View style={styles.region} onLayout={onRegion}>
        {region.w > 0 ? (
          <View
            {...pan.panHandlers}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Tanks on hilly ground at sunset. Your red tank has ${hp[mi]} health, the blue tank ${hp[oi]}. ${windSpoken(view.wind)}.`}
            style={[{ width: W, height: H }, styles.field, webOnly]}
          >
            <Svg
              width={W}
              height={H}
              viewBox={`0 0 ${TANKS_WORLD_W} ${TANKS_WORLD_H}`}
              pointerEvents="none"
            >
              <Sky />
              <Polygon points={terrainPoints(terrain)} fill="#5A3A22" />
              <Polyline
                points={terrainPoints(terrain).split(' ').slice(1, -1).join(' ')}
                fill="none"
                stroke="#6FA34A"
                strokeWidth={7}
                strokeLinejoin="round"
              />
              {arc.map((p, i) => (
                <Circle
                  key={i}
                  cx={p.x}
                  cy={flipY(p.y)}
                  r={4 - i * 0.2}
                  fill="rgba(255,255,255,0.8)"
                  opacity={1 - i * 0.08}
                />
              ))}
              <TankShape
                view={view}
                index={oi}
                terrain={terrain}
                hp={hp[oi]}
                palette={THEM}
                angle={
                  view.last && view.last.by === oppId ? view.last.angle : defaultAim(view, oi).angle
                }
              />
              <TankShape
                view={view}
                index={mi}
                terrain={terrain}
                hp={hp[mi]}
                palette={ME}
                angle={angle}
              />
              {shot ? (
                <ShotLayer
                  shot={shot}
                  elapsed={elapsed}
                  pos={frame?.pos ?? null}
                  view={view}
                  terrain={terrain}
                />
              ) : null}
            </Svg>
          </View>
        ) : null}
      </View>

      {canFire || (shot?.mine && !view.over) ? (
        <View style={styles.pad}>
          <View style={styles.weapons}>
            {WEAPONS.map((w) => {
              const left = myId ? ammoLeft(view, myId, w) : null;
              const out = left === 0;
              const on = weapon === w;
              return (
                <Pressable
                  key={w}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: out }}
                  accessibilityLabel={`${myId ? weaponLabel(view, myId, w) : weaponName(w)}. ${weaponInfo(w)}`}
                  disabled={out}
                  onPress={() => setWeapon(w)}
                  style={[
                    styles.weapon,
                    {
                      backgroundColor: on ? '#E3A93B' : GLASS,
                      borderColor: on ? '#A86F12' : GLASS_EDGE,
                      opacity: out ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text variant="callout" color={on ? '#3A2400' : INK} numberOfLines={1}>
                    {weaponName(w)}
                    {left === null ? '' : ` ${left}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <StepRow
            label="Angle"
            value={`${angle}°`}
            spoken={`Angle ${angle} degrees`}
            steps={[
              ['−5', -5],
              ['−1', -1],
              ['+1', 1],
              ['+5', 5],
            ]}
            onStep={(d) => setAngle(clampAngle(angle + d))}
          />
          <StepRow
            label="Power"
            value={`${power}%`}
            spoken={`Power ${power} percent`}
            steps={[
              ['−5', -5],
              ['−1', -1],
              ['+1', 1],
              ['+5', 5],
            ]}
            onStep={(d) => setPower(clampPower(power + d))}
          />
          <Text variant="footnote" color={SOFT} style={styles.center}>
            {weaponInfo(weapon)} · {spec.ammo === null ? 'unlimited' : `${spec.ammo} per game`}
          </Text>
        </View>
      ) : null}

      <BottomBar
        me={me}
        title={status.title}
        subtitle={moveFailed ? 'That shot didn’t go through. Try again.' : status.sub}
        subtitleColor={moveFailed ? WARN : status.color}
        live
        style={styles.bar}
      >
        <TokenButton
          label={busy ? 'Sending…' : 'Fire'}
          accessibilityLabel={`Fire the ${weaponName(weapon)} at ${angle} degrees, power ${power} percent`}
          tone="ember"
          disabled={!canFire}
          onPress={fire}
          style={styles.main}
        />
      </BottomBar>
    </View>
  );
}

// ---- drawing ---------------------------------------------------------------------------------------------------

function Sky() {
  const id = `sky${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1E1638" />
          <Stop offset="0.45" stopColor="#5A2A55" />
          <Stop offset="0.8" stopColor="#E2704A" />
          <Stop offset="1" stopColor="#FFB27A" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={TANKS_WORLD_W} height={TANKS_WORLD_H} fill={`url(#${id})`} />
      <Circle cx={600} cy={300} r={70} fill="#FFE3A0" opacity={0.85} />
      <Polygon
        points="0,330 80,280 170,310 270,250 370,300 470,260 560,300 680,250 800,290 800,500 0,500"
        fill="#5A3A6A"
        opacity={0.75}
      />
    </>
  );
}

function TankShape({
  view,
  index,
  terrain,
  hp,
  palette,
  angle,
}: {
  view: TanksView;
  index: 0 | 1;
  terrain: number[];
  hp: number;
  palette: { turret: string; body: string; edge: string };
  angle: number;
}) {
  const c = tankAt(view, index, terrain);
  const cx = c.x;
  const cy = flipY(c.y);
  const tip = barrelTip({ x: cx, y: cy }, angle, 30);
  const tipY = cy - 11 - (tip.y - cy);
  const frac = Math.max(0, Math.min(1, hp / 100));
  return (
    <G>
      <Rect x={cx - 25} y={cy + 1} width={50} height={11} rx={5} fill="#1E1A17" />
      <Rect x={cx - 21} y={cy - 9} width={42} height={12} rx={4} fill={palette.body} />
      <Rect x={cx - 21} y={cy + 1} width={42} height={2} fill={palette.edge} />
      <Line
        x1={cx}
        y1={cy - 11}
        x2={tip.x}
        y2={tipY}
        stroke="#2B2B2B"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Circle cx={cx} cy={cy - 11} r={9} fill={palette.turret} />
      <Rect x={cx - 28} y={cy - 40} width={56} height={8} rx={4} fill="rgba(0,0,0,0.45)" />
      <Rect x={cx - 28} y={cy - 40} width={56 * frac} height={8} rx={4} fill={hpColor(hp)} />
    </G>
  );
}

/** The shell in the air, its trail, the blast and the floating damage. */
function ShotLayer({
  shot,
  elapsed,
  pos,
  view,
  terrain,
}: {
  shot: Shot;
  elapsed: number;
  pos: Pt | null;
  view: TanksView;
  terrain: number[];
}) {
  const radius = TANKS_WEAPONS[shot.weapon].radius;
  return (
    <G pointerEvents="none">
      {pos ? (
        <>
          <Circle cx={pos.x} cy={flipY(pos.y)} r={7} fill="#FFF3D6" />
          <Circle cx={pos.x} cy={flipY(pos.y)} r={3.5} fill="#E3A93B" />
        </>
      ) : null}
      {shot.impacts.map((imp, i) => {
        if (imp.kind === 'out') return null;
        const since = elapsed - (shot.tl.ends[i] ?? 0);
        if (since < 0 || since > FLOAT_MS) return null;
        const f = Math.min(1, since / FLASH_MS);
        const hit = imp.damage[0] > 0 ? 0 : imp.damage[1] > 0 ? 1 : null;
        const tc = hit === null ? null : tankAt(view, hit, terrain);
        const rise = Math.min(1, since / FLOAT_MS) * 30;
        return (
          <G key={i}>
            {f < 1 ? (
              <>
                <Circle
                  cx={imp.x}
                  cy={flipY(imp.y)}
                  r={radius * (0.4 + 0.8 * f)}
                  fill="#FFB27A"
                  opacity={0.85 * (1 - f)}
                />
                <Circle
                  cx={imp.x}
                  cy={flipY(imp.y)}
                  r={radius * 0.5 * (1 - f * 0.5)}
                  fill="#FFF3D6"
                  opacity={1 - f}
                />
              </>
            ) : null}
            {tc && hit !== null ? (
              <SvgText
                x={tc.x}
                y={flipY(tc.y) - 48 - rise}
                fill="#FFFFFF"
                fontSize={26}
                fontWeight="900"
                textAnchor="middle"
                opacity={1 - Math.min(1, since / FLOAT_MS)}
              >
                {damageText(imp.damage[hit])}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

function StepRow({
  label,
  value,
  spoken,
  steps,
  onStep,
}: {
  label: string;
  value: string;
  spoken: string;
  steps: [string, number][];
  onStep: (delta: number) => void;
}) {
  return (
    <View style={styles.stepRow}>
      <Text variant="callout" color="#FFD27A" style={styles.stepLabel}>
        {label}
      </Text>
      {steps.slice(0, 2).map(([t, d]) => (
        <StepBtn key={t} text={t} delta={d} label={label} onStep={onStep} />
      ))}
      <Text
        variant="callout"
        color={INK}
        style={styles.stepValue}
        accessibilityLabel={spoken}
        accessibilityLiveRegion="polite"
      >
        {value}
      </Text>
      {steps.slice(2).map(([t, d]) => (
        <StepBtn key={t} text={t} delta={d} label={label} onStep={onStep} />
      ))}
    </View>
  );
}

function StepBtn({
  text,
  delta,
  label,
  onStep,
}: {
  text: string;
  delta: number;
  label: string;
  onStep: (d: number) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${text}`}
      onPress={() => onStep(delta)}
      style={[styles.stepBtn, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
    >
      <Text variant="callout" color={INK}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#2A1638' },
  top: { paddingHorizontal: 10, paddingTop: 8, gap: 6, alignItems: 'center' },
  pills: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between' },
  pill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: 'center',
    flexShrink: 1,
  },
  region: { flex: 1, minHeight: 130, alignItems: 'center', justifyContent: 'center' },
  field: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 8px 24px rgba(0,0,0,0.45)' },
  center: { textAlign: 'center' },
  pad: { paddingHorizontal: 10, paddingTop: 4, gap: 4 },
  weapons: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  weapon: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  stepLabel: { width: 56 },
  stepValue: { width: 56, textAlign: 'center' },
  stepBtn: {
    minWidth: 50,
    minHeight: 44,
    paddingHorizontal: 6,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { margin: 10 },
  main: { minWidth: 92 },
});
