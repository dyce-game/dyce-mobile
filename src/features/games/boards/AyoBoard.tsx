import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text, TokenButton } from '@dyce/ui';
import type { BoardProps } from '../registry/types';
import { BottomBar } from './arcade-kit';
import { AyoFlat } from './AyoFlat';
import { AyoScene } from './AyoScene';
import { Stage3D, type SceneBand } from './board3d/Stage3D';
import { TwoWay } from './board3d/controls';
import { useMoveReplay } from './board3d/use-move-replay';
import { cameraPose, project } from './r3f-common/camera-math';
import { Banner, PlayerChip, SOFT, StatPanel, type BannerState } from './r3f-common/hud';
import { hasPlayed } from './r3f-common/shot-flow';
import { makeNameOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import {
  PIT_R,
  ROW_Z,
  ayoCamera,
  buildSowTimeline,
  isMyTurn,
  isOver,
  lastLine,
  myRow,
  pitXZ,
  predictSow,
  seatOf,
  sowAction,
  sowCopy,
  storeXZ,
  theirRow,
  variantName,
  winTarget,
  type AyoView,
  type Display,
  type Timeline,
} from './ayo-logic';

const ROOM = '#1A0F08';

const displayOf = (v: Pick<AyoView, 'pits' | 'stores'>): Display => ({
  pits: v.pits,
  stores: v.stores,
  hand: null,
  fly: null,
});

/**
 * Ayo Olopon and Mancala as a play surface: a 3D wooden board seen from your seat (React Three Fiber). Tap one
 * of your pits (a brass ring marks the pits you may lift from) to see what it would do (the engine's own rules
 * tell where the last seed lands and what it captures), then press Sow. The move is sown seed by seed, with
 * relays and captures, for both players' moves. Every pit is a real button over the 3D picture, so a screen
 * reader or a keyboard can play without the scene; without WebGL a flat board takes its place. The server
 * decides each move; the board never predicts an outcome it then has to take back.
 */
export function AyoBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<AyoView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const seat = seatOf(view, myId);
  const me = view.players[seat];
  const foe = view.players[1 - seat]!;
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const foeName = nameOf(foe);
  const foePlayer = players.find((p) => p.userId === foe) ?? null;
  const mePlayer = players.find((p) => p.userId === me) ?? null;
  const over = isOver(view);
  const myTurn = isMyTurn(view, myId) && yourTurn;
  const kalah = view.variant === 'kalah';

  const [sel, setSel] = useState<number | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [shown, setShown] = useState<Display | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  // ---- the move just made, sown once ------------------------------------------------------------------

  const prevRef = useRef<AyoView | null>(null);
  const prev = prevRef.current;
  const canReplay =
    !!prev && prev.seq === view.seq - 1 && !!view.last && view.endReason !== 'resign';
  const { replay, done } = useMoveReplay<Timeline>({
    matchId,
    seq: view.seq,
    reduce: reduce || !scene.ok,
    make: () => {
      const p = prevRef.current;
      if (!p || p.seq !== view.seq - 1 || !view.last || view.endReason === 'resign') return null;
      const mover = view.players.indexOf(view.last.by) as 0 | 1;
      return buildSowTimeline(p, view.last, view.variant, mover);
    },
    onSettled: () => onSettledRef.current?.(),
    watchdogMs: 12000,
  });
  useEffect(() => {
    prevRef.current = view;
  }, [view]);
  useEffect(() => {
    setSel(null);
    setShown(null);
  }, [view.seq]);

  // The board shown while nothing plays: the final one, or (for the one frame before the sowing starts) the
  // board before the move, so the finished board never flashes up first.
  const awaiting = !replay && canReplay && !hasPlayed(matchId, view.seq) && !reduce && scene.ok;
  const staticDisplay = useMemo(
    () => displayOf(awaiting && prev ? prev : view),
    [awaiting, prev, view],
  );
  const display = replay
    ? (shown ?? replay.move.frames[0]?.before ?? staticDisplay)
    : staticDisplay;
  const sowing = !!replay || awaiting;

  // What happened, in words.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const line = lastLine(viewRef.current, myId, nameOf);
    if (!line || viewRef.current.endReason === 'resign') return;
    setBanner({
      text: line,
      tone: viewRef.current.last?.captured ? 'hit' : 'rim',
      id: viewRef.current.seq,
    });
    if (
      Platform.OS !== 'web' &&
      viewRef.current.last?.by === myId &&
      viewRef.current.last.captured > 0
    ) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [view.seq, myId, nameOf]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4200);
    return () => clearTimeout(id);
  }, [banner]);

  // ---- choosing and sowing ---------------------------------------------------------------------------

  const canPick = myTurn && !busy && !sowing && !over;
  const legalNow = canPick ? view.legal : [];
  const pred = sel !== null ? predictSow(view, sel) : null;
  const preview = useMemo(
    () => (pred ? { land: pred.landPit, capture: pred.capturedFrom } : null),
    [sel, view.seq],
  );

  function pick(pit: number) {
    if (!canPick || !view.legal.includes(pit)) return;
    setSel((s) => (s === pit ? null : pit));
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  }
  function sow() {
    if (sel === null || !canPick) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pit = sel;
    setSel(null);
    onMove(sowAction(pit));
  }

  // ---- words -------------------------------------------------------------------------------------------

  let title: string;
  let subtitle: string | null;
  if (over) {
    title = view.draw ? 'A draw' : view.winner === myId ? 'You won' : `${foeName} won`;
    subtitle = `You ${view.stores[seat]} · ${foeName} ${view.stores[1 - seat]}`;
  } else if (sowing) {
    title = 'Sowing…';
    subtitle = null;
  } else if (myTurn) {
    title = sel === null ? 'Your turn · pick a pit' : 'Your turn';
    subtitle =
      sel === null ? `First to ${winTarget(view)} seeds wins` : sowCopy(view, myId, sel, pred);
  } else {
    title = `${foeName}'s turn`;
    subtitle = 'Their move is sown here as soon as they make it';
  }

  const capCaption = kalah ? 'IN STORE' : 'CAPTURED';
  const sceneLabel = `${variantName(view.variant)} board, six pits a side${
    kalah ? ' and a store at each end' : ''
  }. You have ${view.stores[seat]} ${kalah ? 'in your store' : 'captured'}, ${foeName} has ${
    view.stores[1 - seat]
  }. Your pits, left to right: ${myRow(seat)
    .map((p) => display.pits[p])
    .join(', ')}. Their pits: ${theirRow(seat)
    .map((p) => display.pits[p])
    .join(', ')}.`;

  const overlay = (band: SceneBand) => {
    const pose = cameraPose(ayoCamera(view.variant), band.width, band.height);
    const at = (x: number, z: number) => project(pose, [x, 0.1, z], band.width, band.height);
    const edge = at(2.5, ROW_Z);
    const next = at(1.5, ROW_Z);
    const step = edge && next ? Math.abs(edge.x - next.x) : 50;
    const size = Math.max(44, Math.min(60, step - 2));
    const nodes: ReactNode[] = [];
    // buttons over your pits
    myRow(seat).forEach((id, k) => {
      const [x, z] = pitXZ(id, seat);
      const c = at(x, z);
      if (!c) return;
      const n = display.pits[id] ?? 0;
      const can = canPick && view.legal.includes(id);
      const isSel = sel === id;
      nodes.push(
        <Pressable
          key={`pit${id}`}
          accessibilityRole="button"
          accessibilityLabel={`Your pit ${k + 1}, ${n} ${n === 1 ? 'seed' : 'seeds'}${
            isSel ? ', selected' : can ? '' : n === 0 ? ', empty' : ''
          }`}
          accessibilityHint={can ? 'Select this pit, then press Sow' : undefined}
          accessibilityState={{ selected: isSel, disabled: !can }}
          disabled={!can}
          onPress={() => pick(id)}
          style={[
            styles.pitHit,
            {
              left: c.x - size / 2,
              top: c.y - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        />,
      );
      const lab = at(x, z + PIT_R + 0.34);
      if (lab) nodes.push(<Count key={`n${id}`} x={lab.x} y={lab.y} n={n} mine />);
    });
    // counts on their pits and the stores
    theirRow(seat).forEach((id) => {
      const [x, z] = pitXZ(id, seat);
      const lab = at(x, z - PIT_R - 0.34);
      if (lab) nodes.push(<Count key={`n${id}`} x={lab.x} y={lab.y} n={display.pits[id] ?? 0} />);
    });
    if (kalah) {
      ([0, 1] as const).forEach((s) => {
        const [x, z] = storeXZ(s, seat, 'kalah');
        const lab = at(x, z + 1.55);
        if (lab)
          nodes.push(<Count key={`s${s}`} x={lab.x} y={lab.y} n={display.stores[s]} store />);
      });
    }
    return nodes;
  };

  return (
    <Stage3D
      room={ROOM}
      sceneLabel={sceneLabel}
      sceneOk={scene.ok}
      onSceneError={scene.fail}
      fallbackText="3D isn't available on this device, so here is the flat board. Playing works the same: tap one of your pits, then Sow."
      scene={() => (
        <AyoScene
          variant={view.variant}
          seat={seat}
          display={display}
          legal={legalNow}
          selected={sel}
          preview={preview}
          replay={replay ? { token: replay.token, timeline: replay.move } : null}
          onStep={setShown}
          onDone={(t) => {
            setShown(null);
            done(t);
          }}
        />
      )}
      flat={(band) => (
        <AyoFlat
          width={band.width}
          height={band.height}
          variant={view.variant}
          seat={seat}
          display={staticDisplay}
          legal={legalNow}
          selected={sel}
          onPit={canPick ? pick : null}
        />
      )}
      overlay={scene.ok ? overlay : undefined}
      top={
        <View style={styles.col} pointerEvents="box-none">
          <View style={styles.row} pointerEvents="box-none">
            <PlayerChip
              player={foePlayer}
              name={foeName}
              line={over ? 'Game over' : view.turn === 1 - seat ? 'Their move' : 'Waiting for you'}
              label={`${foeName}. ${over ? 'Game over' : view.turn === 1 - seat ? 'Their move' : 'Waiting for you'}`}
              highlight={!over && view.turn === 1 - seat}
            />
            <TwoWay
              readOnly
              label="Rules in play"
              value={view.variant}
              options={[
                { value: 'ayo', label: 'Ayo Olopon', accessibilityLabel: 'Ayo Olopon rules' },
                { value: 'kalah', label: 'Mancala', accessibilityLabel: 'Mancala rules' },
              ]}
            />
          </View>
          <View style={styles.row} pointerEvents="none">
            <View style={styles.half}>
              <StatPanel
                caption={`${foeName.toUpperCase()} ${capCaption}`}
                value={String(display.stores[1 - seat])}
                label={`${foeName}: ${display.stores[1 - seat]} ${kalah ? 'in store' : 'captured'}`}
                accent={!over && view.turn === 1 - seat}
              />
            </View>
            <View style={styles.half}>
              <StatPanel
                caption={`YOU ${capCaption}`}
                value={String(display.stores[seat])}
                label={`You: ${display.stores[seat]} ${kalah ? 'in store' : 'captured'}`}
                accent={myTurn}
              />
            </View>
          </View>
        </View>
      }
      banner={<Banner banner={banner} top={scene.ok ? 170 : 220} />}
      bottom={
        <BottomBar
          me={mePlayer}
          title={title}
          subtitle={subtitle}
          live
          subtitleColor={moveFailed ? '#FFB59E' : SOFT}
        >
          {myTurn && !over ? (
            <View style={styles.sow}>
              <TokenButton
                label="Sow"
                tone="brass"
                disabled={sel === null || !canPick}
                accessibilityLabel={
                  sel === null ? 'Sow: pick a pit first' : `Sow pit ${sel - seat * 6 + 1}`
                }
                onPress={sow}
              />
            </View>
          ) : null}
        </BottomBar>
      }
    />
  );
}

/** A count under a pit: the number is the same information the seeds give, readable at a glance. */
function Count({
  x,
  y,
  n,
  mine,
  store,
}: {
  x: number;
  y: number;
  n: number;
  mine?: boolean;
  store?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.count, { left: x - 16, top: y - 10 }]}
    >
      <Text variant="footnote" color={mine || store ? '#FFE6B0' : '#F2DCC0'}>
        {n}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  half: { flex: 1 },
  sow: { minWidth: 92 },
  pitHit: { position: 'absolute' },
  count: {
    position: 'absolute',
    width: 32,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
