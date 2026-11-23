import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { simulateMiniGolfPutt } from '@dyce/games';
import { Text, TokenButton } from '@dyce/ui';
import type { BoardProps } from '../registry/types';
import {
  BottomBar,
  BRASS,
  GLASS,
  GLASS_EDGE,
  GOOD,
  INK,
  PlayerChip,
  SOFT,
  WARN,
} from './arcade-kit';
import { playerName } from './arcade-parse';
import { MiniGolfCourse } from './MiniGolfCourse';
import {
  POWER_DEFAULT,
  POWER_MAX,
  aimAtCup,
  dragToAim,
  guideEnd,
  holeFor,
  holeLine,
  holeName,
  golfSeen,
  holeProgress,
  inputFromAim,
  mmToCm,
  puttLine,
  samePoint,
  scorecardRow,
  stepAngle,
  stepPower,
  strokeLine,
  totalsLine,
  traceAt,
  traceDurationMs,
  visibleLog,
  type MiniGolfView,
  type Pt,
  type PuttView,
} from './mini-golf-logic';

/** The table is a fixed green panel in both themes (design: PlayMiniGolf and PlayMiniGolfDark). */
const FRAME = '#8A5A30';
const BALL = '#FFFFFF';
const OTHER = ['#6FA8F5', '#E3A93B', '#C9B8FF'];

/** One putt being shown: a trace from the shared simulation, played on the hole it was hit on. */
type Shot = {
  mine: boolean;
  hole: number;
  stroke: number;
  trace: [number, number][];
  /** Where the simulation says the ball ends (millimetres). */
  end: Pt;
  sunk: boolean;
  startedAt: number;
  /** The server's answer has arrived and agrees (or the shot is a replay). */
  confirmed: boolean;
  ended: boolean;
};

/**
 * Mini Golf as a play surface: the hole from the seeded course, your ball, and a putt set by pulling back
 * like a slingshot (the length is the power) or with the Aim and Power buttons. The putt is animated from
 * the shared simulation's trace while the move is sent; when the server's answer differs (it never should:
 * same code, integers in, no randomness) the ball is replayed from the server's putt and ends where the
 * server says. A turn is your whole hole, and the others' putts stay hidden until you have finished it.
 */
export function MiniGolfBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<MiniGolfView>) {
  const reduce = useReducedMotion();
  const nameOf = useCallback((id: string) => playerName(players, id), [players]);
  const me = players.find((p) => p.userId === myId) ?? null;
  const others = view.players.filter((p) => p !== myId);

  const holeIdx = Math.min(view.hole, view.holes - 1);
  const myBall = myId ? view.ball[myId] : undefined;
  const myStrokes = (myId ? view.strokes[myId] : null) ?? 0;
  const iAmDone = myId ? view.done[myId] === true : false;

  const [shot, setShot] = useState<Shot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(POWER_DEFAULT);
  const [pulling, setPulling] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [region, setRegion] = useState({ w: 0, h: 0 });

  // Aim at the cup again for each new stroke or hole.
  const aimKey = `${view.hole}:${myStrokes}:${myBall?.x ?? ''}:${myBall?.y ?? ''}`;
  useEffect(() => {
    if (myBall) setAngle(aimAtCup(myBall, holeFor(view, holeIdx).cup));
  }, [aimKey]);

  const canShoot = yourTurn && !busy && !view.over && !iAmDone && !!myBall && shot === null;

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
      if (t - shot.startedAt >= traceDurationMs(shot.trace) + 120) {
        setShot((s) => (s ? { ...s, ended: true } : s));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shot, reduce]);

  // The server's answer to my putt: agree, or replay what the server says.
  useEffect(() => {
    if (!shot || !shot.mine || shot.confirmed) return;
    const p = view.last;
    if (!p || p.by !== myId || p.stroke !== shot.stroke || p.hole !== shot.hole) return;
    if (samePoint(p.to, shot.end)) {
      setShot({ ...shot, confirmed: true });
    } else {
      setShot(shotFrom(view, p, true, true));
    }
  }, [view, shot, myId]);

  // A refused or lost move: put the ball back where the server has it.
  useEffect(() => {
    if (moveFailed && shot?.mine && !shot.confirmed) setShot(null);
  }, [moveFailed, shot]);

  // Done and agreed: the view takes over.
  useEffect(() => {
    if (shot?.ended && shot.confirmed) setShot(null);
  }, [shot]);

  // The game is over: once the last putt has been shown, let the host move on to the result.
  const lastSeq = view.last?.seq ?? 0;
  const settle = useRef(onSettled);
  settle.current = onSettled;
  useEffect(() => {
    if (!view.over || lastSeq === 0 || shot) return;
    golfSeen.mark(matchId, lastSeq);
    settle.current?.();
  }, [view.over, lastSeq, shot, matchId]);
  // A watchdog: the result is never held back for more than a few seconds.
  useEffect(() => {
    if (!view.over || lastSeq === 0) return;
    const id = setTimeout(() => {
      golfSeen.mark(matchId, lastSeq);
      settle.current?.();
    }, 8000);
    return () => clearTimeout(id);
  }, [view.over, lastSeq, matchId]);

  // ---- putting
  const fire = useCallback(
    (a: number, pw: number) => {
      if (!canShoot || !myBall) return;
      const input = inputFromAim(a, pw);
      const hole = holeFor(view, view.hole);
      const sim = simulateMiniGolfPutt(hole, myBall.x, myBall.y, input, true);
      setNow(Date.now());
      setShot({
        mine: true,
        hole: view.hole,
        stroke: myStrokes + 1,
        trace: sim.trace,
        end: { x: sim.outcome.endX, y: sim.outcome.endY },
        sunk: sim.outcome.sunk,
        startedAt: Date.now(),
        confirmed: false,
        ended: false,
      });
      onMove({ kind: 'putt', ...input });
    },
    [canShoot, myBall, view, myStrokes, onMove],
  );

  // ---- the field's size
  const onRegion = (e: LayoutChangeEvent) =>
    setRegion({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const fieldW = Math.max(120, Math.floor(Math.min(region.w - 28, (region.h - 28) / 2)));
  const scale = fieldW / 400;

  // ---- the pull (slingshot)
  const live = useRef({ canShoot, fire, scale, angle, power });
  live.current = { canShoot, fire, scale, angle, power };
  const pull = useRef<{ angle: number; power: number } | null>(null);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.canShoot,
        onMoveShouldSetPanResponder: () => live.current.canShoot,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          pull.current = null;
          setPulling(true);
        },
        onPanResponderMove: (_e, g) => {
          const aim = dragToAim({ x: g.dx, y: g.dy });
          pull.current = aim;
          if (aim) {
            setAngle(aim.angle);
            setPower(aim.power);
          }
        },
        onPanResponderRelease: () => {
          setPulling(false);
          const aim = pull.current;
          pull.current = null;
          if (aim) live.current.fire(aim.angle, aim.power);
        },
        onPanResponderTerminate: () => {
          setPulling(false);
          pull.current = null;
        },
      }),
    [],
  );

  // ---- what to draw
  const drawIdx = shot ? shot.hole : holeIdx;
  const hole = holeFor(view, drawIdx);
  const par = view.pars[drawIdx] ?? 3;
  const ballPos: Pt | null = shot
    ? shot.ended
      ? mmToCm(shot.end)
      : traceAt(shot.trace, now - shot.startedAt)
    : myBall
      ? mmToCm(myBall)
      : null;
  const trail = shot && !shot.ended ? shot.trace : null;
  const hidden = shot?.ended && shot.sunk ? true : false;
  const putts = !shot ? visibleLog(view) : [];
  const last = view.last;
  const theirLast: PuttView | null = last && last.by !== myId ? last : null;

  const replay = () => {
    if (!theirLast) return;
    setNow(Date.now());
    setShot(shotFrom(view, theirLast, false, true));
  };

  // ---- text
  const status = (() => {
    if (view.over)
      return { title: 'Course complete', sub: totalsLine(view, myId, nameOf), color: SOFT };
    if (shot && !shot.ended)
      return { title: strokeLine(shot.stroke, view.maxStrokes), sub: 'Rolling…', color: SOFT };
    if (shot?.ended && shot.sunk) {
      return {
        title: holeName(shot.stroke, par),
        sub: `In the hole in ${shot.stroke}`,
        color: GOOD,
      };
    }
    if (yourTurn && !iAmDone) {
      return {
        title: strokeLine(myStrokes + 1, view.maxStrokes),
        sub: pulling
          ? `Aim ${angle}° · power ${Math.round((power / POWER_MAX) * 100)}%. Let go to putt, or pull back to nothing to cancel.`
          : 'Pull back and let go, or use the buttons',
        color: SOFT,
      };
    }
    if (iAmDone && !view.over) {
      const other = holeProgress(view, myId, nameOf);
      return {
        title: `Waiting for ${view.turn ? nameOf(view.turn) : 'the others'}`,
        sub: other ?? 'You finished this hole',
        color: SOFT,
      };
    }
    return {
      title: `Waiting for ${view.turn ? nameOf(view.turn) : 'them'}`,
      sub: totalsLine(view, myId, nameOf),
      color: SOFT,
    };
  })();

  const webOnly =
    Platform.OS === 'web'
      ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object)
      : null;

  return (
    <View style={styles.stage}>
      <View style={styles.top}>
        <View style={styles.pills}>
          <Pill text={holeLine(view, drawIdx)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showCard ? 'Hide the scorecard' : 'Show the scorecard'}
            onPress={() => setShowCard(!showCard)}
            style={[
              styles.pill,
              styles.pillBtn,
              { backgroundColor: GLASS, borderColor: GLASS_EDGE },
            ]}
          >
            <Text variant="footnote" color={INK} numberOfLines={1}>
              {totalsLine(view, myId, nameOf)}
            </Text>
          </Pressable>
        </View>
        <View style={styles.chips}>
          {others.map((id) => (
            <PlayerChip
              key={id}
              player={players.find((p) => p.userId === id) ?? null}
              name={nameOf(id)}
              line={`${nameOf(id)} · ${view.done[id] ? 'finished this hole' : view.turn === id ? 'playing now' : 'waiting'}`}
            />
          ))}
        </View>
      </View>

      {showCard ? <Scorecard view={view} myId={myId} nameOf={nameOf} /> : null}

      <View style={styles.region} onLayout={onRegion}>
        {region.w > 0 ? (
          <View style={[styles.frame, { padding: 8 }]}>
            <View {...pan.panHandlers} style={[{ width: fieldW, height: fieldW * 2 }, webOnly]}>
              <MiniGolfCourse
                hole={hole}
                width={fieldW}
                label={`${holeLine(view, drawIdx)}. Ball ${ballPos ? 'on the course' : 'not shown'}, the cup is at the top.`}
              />
              <Svg
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                width={fieldW}
                height={fieldW * 2}
                viewBox="0 0 400 800"
              >
                {putts.map((p, i) => {
                  const col = p.by === myId ? BALL : (OTHER[i % OTHER.length] as string);
                  const a = mmToCm(p.from);
                  const b = mmToCm(p.to);
                  return (
                    <G key={p.seq}>
                      <Line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={col}
                        strokeWidth={2.5}
                        strokeDasharray="6 6"
                        opacity={0.7}
                      />
                      <Circle cx={b.x} cy={b.y} r={3.5} fill={col} opacity={0.8} />
                    </G>
                  );
                })}
                {trail ? <Trail trace={trail} until={now - (shot?.startedAt ?? now)} /> : null}
                {ballPos && canShoot ? (
                  <AimGuide ball={ballPos} angle={angle} power={power} active={pulling} />
                ) : null}
                {ballPos && !hidden ? (
                  <>
                    <Circle cx={ballPos.x + 1.5} cy={ballPos.y + 3} r={5} fill="rgba(0,0,0,0.35)" />
                    <Circle
                      cx={ballPos.x}
                      cy={ballPos.y}
                      r={5}
                      fill={BALL}
                      stroke="#A9A398"
                      strokeWidth={1}
                    />
                  </>
                ) : null}
              </Svg>
            </View>
          </View>
        ) : null}
      </View>

      {canShoot ? (
        <View style={styles.pad}>
          <StepRow
            label="Aim"
            value={`${angle}°`}
            spoken={`Aim ${angle} degrees`}
            steps={[
              ['−5°', -5],
              ['−1°', -1],
              ['+1°', 1],
              ['+5°', 5],
            ]}
            onStep={(d) => setAngle(stepAngle(angle, d))}
          />
          <StepRow
            label="Power"
            value={`${Math.round((power / POWER_MAX) * 100)}%`}
            spoken={`Power ${Math.round((power / POWER_MAX) * 100)} percent`}
            steps={[
              ['−10', -100],
              ['−1', -10],
              ['+1', 10],
              ['+10', 100],
            ]}
            onStep={(d) => setPower(stepPower(power, d))}
          />
        </View>
      ) : theirLast && !shot && !view.over ? (
        <View style={styles.pad}>
          <Text
            variant="footnote"
            color={SOFT}
            style={styles.center}
            accessibilityLiveRegion="polite"
          >
            {puttLine(theirLast, nameOf(theirLast.by), view.pars[theirLast.hole] ?? par)}
          </Text>
          <TokenButton
            label="Watch their putt"
            accessibilityLabel={`Watch ${nameOf(theirLast.by)}'s last putt again`}
            tone="chip"
            onPress={replay}
          />
        </View>
      ) : null}

      <BottomBar
        me={me}
        title={status.title}
        subtitle={moveFailed ? 'That putt didn’t go through. Try again.' : status.sub}
        subtitleColor={moveFailed ? WARN : status.color}
        live
        style={styles.bar}
      >
        <TokenButton
          label={busy ? 'Sending…' : 'Putt'}
          accessibilityLabel={`Putt now. Aim ${angle} degrees, power ${Math.round((power / POWER_MAX) * 100)} percent.`}
          tone="ember"
          disabled={!canShoot}
          onPress={() => fire(angle, power)}
          style={styles.main}
        />
      </BottomBar>
    </View>
  );
}

/** A shot to play from a stored putt: the simulation runs from where the putt started, with its input. */
function shotFrom(view: MiniGolfView, p: PuttView, mine: boolean, confirmed: boolean): Shot {
  const hole = holeFor(view, p.hole);
  const sim = simulateMiniGolfPutt(hole, p.from.x, p.from.y, p.input, true);
  return {
    mine,
    hole: p.hole,
    stroke: p.stroke,
    trace: sim.trace,
    end: { x: p.to.x, y: p.to.y },
    sunk: p.sunk,
    startedAt: Date.now(),
    confirmed,
    ended: false,
  };
}

// ---- drawing the live bits ---------------------------------------------------------------------------------

/** The part of the path the ball has rolled so far, as a faint line. */
function Trail({ trace, until }: { trace: [number, number][]; until: number }) {
  const n = Math.min(trace.length - 1, Math.max(1, Math.floor((Math.max(0, until) / 1000) * 30)));
  const pts = trace.slice(0, n + 1).map(([x, y]) => `${x / 10},${y / 10}`);
  return (
    <Polyline
      points={pts.join(' ')}
      fill="none"
      stroke="rgba(255,255,255,0.35)"
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

/** A dotted line from the ball showing where the putt is aimed; longer for more power. */
function AimGuide({
  ball,
  angle,
  power,
  active,
}: {
  ball: Pt;
  angle: number;
  power: number;
  active: boolean;
}) {
  const end = guideEnd(ball, angle, power);
  const back = guideEnd(ball, angle + 180, active ? power * 0.35 : 0);
  return (
    <>
      {active ? (
        <Line
          x1={ball.x}
          y1={ball.y}
          x2={back.x}
          y2={back.y}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ) : null}
      <Line
        x1={ball.x}
        y1={ball.y}
        x2={end.x}
        y2={end.y}
        stroke="rgba(255,255,255,0.92)"
        strokeWidth={4}
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <Circle cx={end.x} cy={end.y} r={5} fill="#FFD27A" />
    </>
  );
}

// ---- small pieces --------------------------------------------------------------------------------------------

function Pill({ text }: { text: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: GLASS }]}>
      <Text variant="caption" color={INK}>
        {text}
      </Text>
    </View>
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
    <View style={styles.stepRow} accessible={false}>
      <Text variant="callout" color={BRASS} style={styles.stepLabel}>
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

function Scorecard({
  view,
  myId,
  nameOf,
}: {
  view: MiniGolfView;
  myId: string | null;
  nameOf: (id: string) => string;
}) {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  const holes = Array.from({ length: view.holes }, (_, i) => i);
  return (
    <View
      style={[styles.card, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
      accessible
      accessibilityLabel={`Scorecard. ${order
        .map((id) => `${id === myId ? 'You' : nameOf(id)}: ${view.totals[id] ?? 0} strokes`)
        .join('. ')}`}
    >
      <View style={styles.cardRow}>
        <Text variant="caption" color={SOFT} style={styles.cardName}>
          Hole
        </Text>
        {holes.map((i) => (
          <Text
            key={i}
            variant="caption"
            color={i === view.hole ? BRASS : SOFT}
            style={styles.cardCell}
          >
            {i + 1}
          </Text>
        ))}
        <Text variant="caption" color={SOFT} style={styles.cardCell}>
          Tot
        </Text>
      </View>
      <View style={styles.cardRow}>
        <Text variant="caption" color={SOFT} style={styles.cardName}>
          Par
        </Text>
        {holes.map((i) => (
          <Text key={i} variant="caption" color={SOFT} style={styles.cardCell}>
            {view.pars[i]}
          </Text>
        ))}
        <Text variant="caption" color={SOFT} style={styles.cardCell}>
          {view.pars.reduce((a, b) => a + b, 0)}
        </Text>
      </View>
      {order.map((id) => {
        const row = scorecardRow(view, id);
        return (
          <View key={id} style={styles.cardRow}>
            <Text variant="caption" color={INK} numberOfLines={1} style={styles.cardName}>
              {id === myId ? 'You' : nameOf(id)}
            </Text>
            {row.cells.map((c, i) => (
              <Text key={i} variant="caption" color={INK} style={styles.cardCell}>
                {c ?? '·'}
              </Text>
            ))}
            <Text variant="caption" color={BRASS} style={styles.cardCell}>
              {row.total}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#17381F' },
  top: { paddingHorizontal: 10, paddingTop: 8, gap: 6, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  pills: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  pill: { minHeight: 30, paddingHorizontal: 10, borderRadius: 15, justifyContent: 'center' },
  pillBtn: { minHeight: 44, borderWidth: 1, flexShrink: 1 },
  region: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  frame: {
    borderRadius: 24,
    backgroundColor: FRAME,
    boxShadow: '0px 8px 0px #3B2111, 0px 18px 30px rgba(0,0,0,0.4)',
  },
  center: { textAlign: 'center' },
  pad: { paddingHorizontal: 10, paddingTop: 4, gap: 6, alignItems: 'center' },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  stepLabel: { width: 52 },
  stepValue: { width: 54, textAlign: 'center' },
  stepBtn: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: 6,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { margin: 10 },
  main: { minWidth: 92 },
  card: {
    marginHorizontal: 10,
    marginTop: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardName: { width: 44 },
  cardCell: { flex: 1, textAlign: 'center' },
});
