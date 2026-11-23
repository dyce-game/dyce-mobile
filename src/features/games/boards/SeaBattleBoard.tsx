import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text, TokenButton } from '@dyce/ui';
import type { BoardProps } from '../registry/types';
import { BottomBar } from './arcade-kit';
import { Stage3D, type SceneBand } from './board3d/Stage3D';
import { ArrowRow, GlassButton, TOUCH, TwoWay } from './board3d/controls';
import { useMoveReplay } from './board3d/use-move-replay';
import { cameraPose, project, unproject } from './r3f-common/camera-math';
import {
  BRASS,
  Banner,
  GLASS,
  GLASS_EDGE,
  INK,
  PlayerChip,
  SOFT,
  type BannerState,
} from './r3f-common/hud';
import { makeNameOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { SeaBattleFlat, SeaBattleMini } from './SeaBattleFlat';
import { SeaBattleScene, type Fresh } from './SeaBattleScene';
import {
  SEA_CAMERA,
  SIZE,
  afloatLine,
  alreadyFired,
  canAct,
  canPlace,
  cellAt,
  cellOf,
  cellStatus,
  clampPlacement,
  colOf,
  coordLabel,
  countsOf,
  emptyLayout,
  fireAction,
  foeOf,
  layoutComplete,
  layoutShips,
  meOf,
  nextUnplaced,
  nudge,
  placeAction,
  placedCount,
  randomLayout,
  rowOf,
  shotCopy,
  type Dir,
  type Layout,
  type SeaBattleView,
} from './sea-battle-logic';

const ROOM = '#0B2447';
const pretty = (id: string): string => id.replace(/^./, (c) => c.toUpperCase());

/**
 * Sea Battle as a play surface: a 3D sea seen from a corner (React Three Fiber). Both players place their fleet
 * at the same time (tap a square or use the arrows to choose the spot, Rotate, Place, then Ready); then they
 * take turns firing at the other player's waters. The same controls drive a flat grid when 3D is not
 * available. The server decides every shot and keeps the other fleet hidden; the board draws only what the
 * view gives it, and replays each new shot once (a shell, then a splash or fire).
 */
export function SeaBattleBoard({
  matchId,
  view,
  players,
  myId,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<SeaBattleView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const me = meOf(view, myId);
  const foe = foeOf(view, myId);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const foeName = nameOf(foe);
  const foePlayer = players.find((p) => p.userId === foe) ?? null;
  const mePlayer = players.find((p) => p.userId === me) ?? null;
  const spec = view.fleetSpec;
  const total = spec.length;
  const isPlayer = !!myId && view.players.includes(myId);
  const myTurnNow = canAct(view, myId);
  const placing = view.phase === 'placing' && isPlayer && !view.placed[me];
  const battle = view.phase === 'battle';
  const mineWaters = view.boards[me]!;
  const foeWaters = view.boards[foe]!;

  const [viewing, setViewing] = useState<'mine' | 'theirs'>(
    view.phase === 'placing' ? 'mine' : 'theirs',
  );
  const [cursor, setCursor] = useState(44);
  const [layout, setLayout] = useState<Layout>(() => emptyLayout(spec));
  const [sel, setSel] = useState<number | null>(0);
  const [dir, setDir] = useState<Dir>('h');
  const [picks, setPicks] = useState<number[]>([]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const sendingRef = useRef(false);
  useEffect(() => {
    if (!busy) sendingRef.current = false;
  }, [busy]);

  // ---- the newest shot, shown once --------------------------------------------------------------------

  const { replay, done } = useMoveReplay<{ by: string; shots: Fresh['shots'] }>({
    matchId,
    seq: view.seq,
    reduce: reduce || !scene.ok,
    make: () =>
      view.last && view.endReason !== 'resign' && view.phase !== 'placing'
        ? {
            by: view.last.by,
            shots: view.last.shots.map((s) => ({ cell: s.cell, result: s.result })),
          }
        : null,
    onSettled: () => onSettledRef.current?.(),
    watchdogMs: 4000,
  });

  // While a shot plays, show the waters it lands on; afterwards go back to the other player's waters.
  const replayBy = replay?.move.by;
  useEffect(() => {
    if (replayBy) setViewing(replayBy === me ? 'theirs' : 'mine');
  }, [replayBy, replay?.token, me]);
  const hadReplay = useRef(false);
  useEffect(() => {
    if (replay) {
      hadReplay.current = true;
      return;
    }
    if (!hadReplay.current) return;
    hadReplay.current = false;
    if (view.phase !== 'battle') return;
    const id = setTimeout(() => setViewing('theirs'), 1100);
    return () => clearTimeout(id);
  }, [replay, view.phase]);
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === 'placing' && view.phase === 'battle') setViewing('theirs');
    prevPhase.current = view.phase;
  }, [view.phase]);

  // What just happened, as words.
  const lastRef = useRef(view);
  lastRef.current = view;
  useEffect(() => {
    const v = lastRef.current;
    if (!v.last || v.phase === 'placing' || v.endReason === 'resign') return;
    const c = shotCopy(v.last, myId, nameOf);
    setBanner({ text: c.text, tone: c.tone, id: v.seq });
    if (
      Platform.OS !== 'web' &&
      v.last.by === myId &&
      v.last.shots.some((s) => s.result !== 'miss')
    ) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [view.seq, myId, nameOf]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  // ---- placing ------------------------------------------------------------------------------------------

  const selShip = sel !== null ? spec[sel] : undefined;
  const gp = selShip
    ? clampPlacement(selShip.len, { r: rowOf(cursor), c: colOf(cursor), dir })
    : null;
  const ghostOk = !!(selShip && gp && sel !== null && canPlace(spec, layout, sel, gp));
  const ready = layoutComplete(layout);

  function pickShip(i: number) {
    const p = layout[i];
    if (p) {
      const next = layout.slice();
      next[i] = null;
      setLayout(next);
      setDir(p.dir);
      setCursor(cellOf(p.r, p.c));
    }
    setSel(i);
  }
  function placeHere() {
    if (sel === null || !gp || !ghostOk) return;
    const next = layout.slice();
    next[sel] = gp;
    setLayout(next);
    setSel(next.every((p) => p !== null) ? null : nextUnplaced(next));
  }
  function shuffle() {
    setLayout(randomLayout(Math.floor(Math.random() * 1_000_000)));
    setSel(null);
  }
  function clear() {
    setLayout(emptyLayout(spec));
    setSel(0);
  }
  function sendFleet() {
    if (!layoutComplete(layout) || busy || sendingRef.current) return;
    sendingRef.current = true;
    onMove(placeAction(layout));
  }

  // ---- firing -------------------------------------------------------------------------------------------

  const aiming = battle && myTurnNow && viewing === 'theirs';
  const firable = aiming && !busy && !alreadyFired(foeWaters, cursor) && !picks.includes(cursor);
  function fire() {
    if (!firable) return;
    const chosen = [...picks, cursor];
    if (chosen.length < view.shotsAllowed) {
      setPicks(chosen);
      return;
    }
    setPicks([]);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(fireAction(chosen));
  }

  // ---- the cursor ---------------------------------------------------------------------------------------

  const shownCursor = placing ? (gp ? cellOf(gp.r, gp.c) : null) : aiming ? cursor : null;
  function moveCursor(dr: number, dc: number) {
    setCursor(nudge(shownCursor ?? cursor, dr, dc));
  }
  function tapCell(cell: number | null) {
    if (cell === null) return;
    if (placing || aiming) setCursor(cell);
  }
  function onScenePress(x: number, y: number, band: SceneBand) {
    const pose = cameraPose(SEA_CAMERA, band.width, band.height);
    const p = unproject(pose, x, y, band.width, band.height, 0);
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[2])) tapCell(cellAt(p[0], p[2]));
  }

  // ---- what to draw ---------------------------------------------------------------------------------------

  const waters = viewing === 'mine' ? mineWaters : foeWaters;
  const afloat = useMemo(
    () =>
      viewing === 'mine'
        ? placing || !mineWaters.ships
          ? layoutShips(spec, layout)
          : mineWaters.ships
        : view.phase === 'over'
          ? (foeWaters.ships ?? [])
          : [],
    [viewing, placing, mineWaters.ships, spec, layout, view.phase, foeWaters.ships],
  );
  const ships = useMemo(() => {
    const sunkIds = new Set(waters.sunk.map((s) => s.id));
    return afloat.filter((s) => !sunkIds.has(s.id));
  }, [afloat, waters.sunk]);
  const ghost = useMemo(
    () =>
      placing && viewing === 'mine' && selShip && gp
        ? { ship: { id: selShip.id, len: selShip.len, ...gp }, ok: ghostOk }
        : null,
    [placing, viewing, selShip, gp?.r, gp?.c, gp?.dir, ghostOk],
  );
  const fresh: Fresh | null = useMemo(
    () =>
      replay && (replay.move.by === me) === (viewing === 'theirs')
        ? { token: replay.token, shots: replay.move.shots }
        : null,
    [replay, me, viewing],
  );
  const cursorShown = viewing === (placing ? 'mine' : 'theirs') ? shownCursor : null;
  const cursorTone: 'ok' | 'bad' = placing ? (ghostOk ? 'ok' : 'bad') : firable ? 'ok' : 'bad';

  const c = countsOf(waters);
  const sceneLabel =
    viewing === 'mine'
      ? `Your waters. ${
          placing
            ? `${placedCount(layout)} of ${total} ships placed.`
            : `${afloatLine(mineWaters, total)}. ${c.hits} hits and ${c.misses} misses against you.`
        }`
      : `${foeName}'s waters. ${c.hits} hits, ${c.misses} misses, ${c.sunk} ${
          c.sunk === 1 ? 'ship' : 'ships'
        } sunk.`;

  // ---- words ----------------------------------------------------------------------------------------------

  const waitingFoe = view.phase === 'placing' && isPlayer && view.placed[me] && !view.placed[foe];
  let title = '';
  let subtitle: string | null = null;
  if (view.phase === 'over') {
    title = view.winner === myId ? 'You sank the fleet' : 'Game over';
  } else if (waitingFoe) {
    title = 'Fleet ready';
    subtitle = `Waiting for ${foeName} to place their fleet`;
  } else if (battle && myTurnNow) {
    title = 'Your shot';
    subtitle =
      viewing !== 'theirs'
        ? `Switch to ${foeName}'s waters to aim`
        : alreadyFired(foeWaters, cursor)
          ? `Already fired at ${coordLabel(cursor)}: pick another square`
          : `Aiming at ${coordLabel(cursor)} · ${cellStatus(foeWaters, cursor)}${
              view.shotsAllowed > 1 ? ` · shot ${picks.length + 1} of ${view.shotsAllowed}` : ''
            }`;
  } else if (battle) {
    title = `${foeName} is aiming`;
    subtitle = 'Their shot appears here as soon as it is fired';
  } else if (!isPlayer) {
    title = 'Watching';
  }

  const coordLabels = (band: SceneBand) => {
    const pose = cameraPose(SEA_CAMERA, band.width, band.height);
    const out: { key: string; x: number; y: number; t: string }[] = [];
    for (let i = 0; i < SIZE; i++) {
      const a = project(pose, [i + 0.5, 0, SIZE + 0.55], band.width, band.height);
      if (a) out.push({ key: `c${i}`, x: a.x, y: a.y, t: 'ABCDEFGHIJ'[i] ?? '' });
      const b = project(pose, [-0.55, 0, i + 0.5], band.width, band.height);
      if (b) out.push({ key: `r${i}`, x: b.x, y: b.y, t: String(i + 1) });
    }
    return out;
  };

  const miniWaters = mineWaters;
  const miniShips = placing ? layoutShips(spec, layout) : (mineWaters.ships ?? []);

  return (
    <Stage3D
      room={ROOM}
      sceneLabel={sceneLabel}
      sceneOk={scene.ok}
      onSceneError={scene.fail}
      fallbackText="3D isn't available on this device, so here is the flat sea. Playing works the same: tap a square or use the arrows, then Place or Fire."
      onScenePress={placing || aiming ? onScenePress : undefined}
      scene={() => (
        <SeaBattleScene
          shots={waters.shots}
          ships={ships}
          sunk={waters.sunk}
          cursor={cursorShown}
          cursorTone={cursorTone}
          picks={viewing === 'theirs' ? picks : []}
          ghost={ghost}
          fresh={fresh}
          onFreshDone={done}
        />
      )}
      flat={(band) => (
        <SeaBattleFlat
          width={band.width}
          height={band.height}
          waters={waters}
          ships={ships}
          cursor={cursorShown}
          cursorBad={cursorTone === 'bad'}
          ghost={ghost}
          picks={viewing === 'theirs' ? picks : []}
          onCell={placing || aiming ? tapCell : null}
        />
      )}
      overlay={(band) =>
        scene.ok
          ? coordLabels(band).map((l) => (
              <View
                key={l.key}
                pointerEvents="none"
                style={[styles.coord, { left: l.x - 10, top: l.y - 9 }]}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              >
                <Text variant="caption" color={SOFT}>
                  {l.t}
                </Text>
              </View>
            ))
          : null
      }
      top={
        <View style={styles.topRow} pointerEvents="box-none">
          <PlayerChip
            player={foePlayer}
            name={foeName}
            line={
              view.phase === 'placing'
                ? view.placed[foe]
                  ? 'Fleet ready'
                  : 'Placing their fleet'
                : `${foeWaters.shipsLeft} of ${total} afloat`
            }
            label={`${foeName}. ${
              view.phase === 'placing'
                ? view.placed[foe]
                  ? 'Fleet ready'
                  : 'Placing their fleet'
                : afloatLine(foeWaters, total)
            }`}
            highlight={!placing && !waitingFoe && battle && view.turn === foe}
          />
          {view.phase !== 'placing' && isPlayer ? (
            <TwoWay
              label="Which waters to show"
              value={viewing}
              onChange={setViewing}
              options={[
                {
                  value: 'theirs',
                  label: 'Their waters',
                  accessibilityLabel: `Show ${foeName}'s waters`,
                },
                { value: 'mine', label: 'Your fleet', accessibilityLabel: 'Show your fleet' },
              ]}
            />
          ) : null}
        </View>
      }
      banner={<Banner banner={banner} top={scene.ok ? 84 : 132} />}
      bottom={
        placing ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tray}
              accessibilityLabel="Your ships"
            >
              {spec.map((s, i) => {
                const p = layout[i];
                const on = sel === i;
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${pretty(s.id)}, ${s.len} squares, ${
                      p ? `placed at ${coordLabel(cellOf(p.r, p.c))}, tap to move it` : 'not placed'
                    }${on ? ', selected' : ''}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => pickShip(i)}
                    style={[
                      styles.chip,
                      { borderColor: on ? BRASS : GLASS_EDGE, borderWidth: on ? 2 : 1 },
                    ]}
                  >
                    <Text variant="footnote" color={INK}>
                      {pretty(s.id)}
                    </Text>
                    <View style={styles.lenDots}>
                      {Array.from({ length: s.len }, (_, k) => (
                        <View
                          key={k}
                          style={[styles.lenDot, { backgroundColor: p ? '#7BE3A8' : SOFT }]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.row}>
              <ArrowRow noun="ship" onMove={moveCursor} disabled={sel === null} />
              <GlassButton
                label="Rotate"
                accessibilityLabel={`Rotate the ship, now lying ${dir === 'h' ? 'across' : 'down'}`}
                disabled={sel === null}
                onPress={() => setDir((d) => (d === 'h' ? 'v' : 'h'))}
              />
            </View>
            <View style={styles.row}>
              <GlassButton
                label="Shuffle"
                accessibilityLabel="Shuffle: place all ships at random"
                onPress={shuffle}
              />
              <GlassButton
                label="Clear"
                accessibilityLabel="Clear: take every ship off the sea"
                disabled={placedCount(layout) === 0}
                onPress={clear}
              />
              <View style={styles.grow}>
                {ready ? (
                  <TokenButton
                    label="Ready"
                    tone="felt"
                    disabled={busy}
                    accessibilityLabel="Ready: lock in this fleet"
                    onPress={sendFleet}
                  />
                ) : (
                  <TokenButton
                    label="Place"
                    tone="brass"
                    disabled={!ghostOk}
                    accessibilityLabel={
                      selShip
                        ? `Place the ${selShip.id} at ${gp ? coordLabel(cellOf(gp.r, gp.c)) : ''}${
                            ghostOk ? '' : ', not possible here'
                          }`
                        : 'Place ship'
                    }
                    onPress={placeHere}
                  />
                )}
              </View>
            </View>
            <View style={styles.hint} accessibilityLiveRegion="polite">
              <Text variant="footnote" color={INK} numberOfLines={2}>
                {ready
                  ? 'Fleet set. Tap Ready to lock it in, or tap a ship to move it.'
                  : selShip
                    ? `${pretty(selShip.id)} (${selShip.len}) at ${gp ? coordLabel(cellOf(gp.r, gp.c)) : ''}${
                        ghostOk ? '' : ' is blocked'
                      }. Tap the sea or use the arrows.`
                    : 'Tap a ship to move it.'}
              </Text>
            </View>
          </>
        ) : (
          <>
            {isPlayer && view.phase !== 'over' ? (
              <View style={styles.row}>
                <View
                  accessible
                  accessibilityLabel={`Your fleet: ${afloatLine(miniWaters, total)}`}
                  style={styles.mini}
                >
                  <SeaBattleMini size={64} waters={miniWaters} ships={miniShips} />
                  <View style={styles.miniText}>
                    <Text variant="caption" color={SOFT}>
                      Your fleet
                    </Text>
                    <Text variant="callout" color={INK} numberOfLines={2}>
                      {miniWaters.shipsLeft} of {total} afloat
                    </Text>
                  </View>
                </View>
                {aiming ? <ArrowRow noun="target" onMove={moveCursor} /> : null}
              </View>
            ) : null}
            <BottomBar
              me={mePlayer}
              title={title}
              subtitle={subtitle}
              live
              subtitleColor={moveFailed ? '#FFB59E' : SOFT}
            >
              {aiming ? (
                <View style={styles.fire}>
                  <TokenButton
                    label={
                      view.shotsAllowed > 1 && picks.length + 1 < view.shotsAllowed
                        ? 'Mark'
                        : 'Fire'
                    }
                    tone="ember"
                    disabled={!firable}
                    accessibilityLabel={
                      firable
                        ? `Fire at ${coordLabel(cursor)}`
                        : alreadyFired(foeWaters, cursor)
                          ? `Fire: already fired at ${coordLabel(cursor)}`
                          : 'Fire'
                    }
                    onPress={fire}
                  />
                </View>
              ) : null}
            </BottomBar>
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  topRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grow: { flex: 1 },
  tray: { gap: 8, paddingRight: 8 },
  chip: {
    minHeight: TOUCH,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 22,
    backgroundColor: GLASS,
    justifyContent: 'center',
    gap: 3,
  },
  lenDots: { flexDirection: 'row', gap: 2 },
  lenDot: { width: 8, height: 5, borderRadius: 2 },
  hint: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  mini: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  miniText: { flexShrink: 1 },
  fire: { minWidth: 96 },
  coord: {
    position: 'absolute',
    width: 20,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
