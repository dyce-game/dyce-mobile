import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@dyce/ui';
import type { MatchPlayer } from '@dyce/shared';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import type { BoardProps } from '../registry/types';
import { BottomBar } from './arcade-kit';
import { Stage3D, type SceneBand } from './board3d/Stage3D';
import { DieFace } from './board3d/DieFace';
import { TOUCH } from './board3d/controls';
import { useMoveReplay } from './board3d/use-move-replay';
import { cameraPose, project } from './r3f-common/camera-math';
import { BRASS, Banner, GLASS, GLASS_EDGE, INK, SOFT, type BannerState } from './r3f-common/hud';
import { hasPlayed } from './r3f-common/shot-flow';
import { makeNameOf } from './r3f-common/board-utils';
import { useSceneSupport } from './r3f-common/webgl';
import { LUDO_CAMERA, LudoScene, type SceneEvent } from './LudoScene';
import { LudoFlat } from './LudoFlat';
import {
  NEUTRAL,
  colorNameOf,
  colorOf,
  eventOf,
  homeCount,
  isActive,
  isMyTurn,
  lastLine,
  layoutPawns,
  ludoScoreLine,
  moveAction,
  mySeat,
  previewLine,
  previewMove,
  quadOf,
  rollAction,
  tokenCell,
  tokenLabel,
  tokensBefore,
  toWorld,
  viewTurns,
  type Event,
  type LudoView,
} from './ludo-logic';

const ROOM = '#131313';
const GREEN = '#2BB673';

/**
 * Ludo as a play surface: the board tilted towards you in 3D (React Three Fiber), your yard nearest you. The
 * die is the server's: you press Roll, the server rolls from its seeded generator and the move result says what
 * came up, so the die in the middle only ever lands on what the server rolled (while the request is on its
 * way it tumbles without landing). A six leaves the yard; captures send tokens home; stars and start squares
 * are safe. Tap one of your tokens that has a ring to move it, or use the token strip under the board, which
 * says what each move would do and is the way to play with a screen reader or without 3D. The server decides
 * every roll and move; the board replays each new event once (the roll, the hop, the capture).
 */
export function LudoBoard({
  matchId,
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
  onSettled,
}: BoardProps<LudoView>) {
  const reduce = useReducedMotion();
  const scene = useSceneSupport();
  const seat = mySeat(view, myId);
  const nameOf = useMemo(() => makeNameOf(players), [players]);
  const myPlayer = players.find((p) => p.userId === view.players[seat]) ?? null;
  const myTurn = isMyTurn(view, myId) && yourTurn;
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [rollSent, setRollSent] = useState(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  // ---- who sits where ----------------------------------------------------------------------------------

  const quads = useMemo(() => view.players.map((_, s) => quadOf(view, s)), [view]);
  const colors = useMemo(() => view.players.map((_, s) => colorOf(view, s, myId)), [view, myId]);
  const quadColors = useMemo(
    () => [0, 1, 2, 3].map((q) => colors[quads.indexOf(q)] ?? NEUTRAL),
    [colors, quads],
  );
  const turns = viewTurns(quads[seat] ?? 0);

  // ---- the last event, shown once ------------------------------------------------------------------------

  const { replay, done } = useMoveReplay<Event>({
    matchId,
    seq: view.seq,
    reduce: reduce || !scene.ok,
    make: () => (view.last ? eventOf(view.last) : null),
    onSettled: () => onSettledRef.current?.(),
    watchdogMs: 5000,
  });
  const awaiting = !replay && !!view.last && !hasPlayed(matchId, view.seq) && !reduce && scene.ok;
  const showingBefore = !!view.last && view.last.kind === 'move' && (!!replay || awaiting);
  const tokens = useMemo(
    () => (showingBefore ? tokensBefore(view) : view.tokens),
    [showingBefore, view],
  );
  const animating = !!replay || awaiting;

  const sceneEvent: SceneEvent | null = useMemo(() => {
    if (!replay || !view.last) return null;
    const by = view.players.indexOf(view.last.by);
    if (by < 0) return null;
    const last = view.last;
    const captured =
      last.kind === 'move'
        ? last.captured.flatMap((c) => {
            const s = view.players.indexOf(c.player);
            if (s < 0) return [];
            const from = toWorld(tokenCell(quads[by] ?? 0, last.to, last.token), turns);
            const to = toWorld(tokenCell(quads[s] ?? 0, -1, c.token), turns);
            return [{ seat: s, token: c.token, from, to }];
          })
        : [];
    return {
      seat: by,
      token: last.kind === 'move' ? last.token : 0,
      quad: quads[by] ?? 0,
      ev: replay.move,
      captured,
    };
  }, [replay, view, quads, turns]);

  // ---- words, haptics -------------------------------------------------------------------------------------

  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const v = viewRef.current;
    const line = lastLine(v, myId, nameOf);
    if (!line || !v.last) return;
    const tone =
      v.last.kind === 'move' && v.last.captured.length > 0
        ? v.last.by === myId
          ? 'hit'
          : 'foul'
        : 'rim';
    setBanner({ text: line, tone, id: v.seq });
    if (
      Platform.OS !== 'web' &&
      v.last.by === myId &&
      v.last.kind === 'move' &&
      v.last.captured.length
    ) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [view.seq, myId, nameOf]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 4200);
    return () => clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    if (!busy) setRollSent(false);
  }, [busy]);

  // ---- acting ------------------------------------------------------------------------------------------

  const canRoll = myTurn && view.phase === 'roll' && !busy && !animating && !view.over;
  const canMove = myTurn && view.phase === 'move' && !busy && !animating && !view.over;
  const legal = canMove ? view.legal : [];
  function roll() {
    if (!canRoll) return;
    setRollSent(true);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMove(rollAction());
  }
  function move(token: number) {
    if (!canMove || !view.legal.includes(token)) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(moveAction(token));
  }

  // ---- what to show ------------------------------------------------------------------------------------

  const dieValue = view.phase === 'move' ? view.dice : (view.last?.dice ?? null);
  const rolling = rollSent && busy && view.phase === 'roll';
  const foes = view.players.map((id, s) => ({ id, s })).filter((x) => x.s !== seat);
  const turnName = view.players[view.turn] ? nameOf(view.players[view.turn] as string) : '';
  const turnColor = colorNameOf(view, view.turn, myId);

  let title: string;
  let subtitle: string | null = null;
  if (view.over) {
    const won = view.finished[0] === myId;
    title = won ? 'You won' : view.finished[0] ? `${nameOf(view.finished[0])} won` : 'Game over';
    subtitle = ludoScoreLine(view, myId, nameOf);
  } else if (animating && view.last) {
    title = view.last.kind === 'move' ? 'Moving…' : 'Rolling…';
  } else if (canRoll) {
    title = 'Your turn';
    subtitle = view.sixes > 0 ? 'A six! Roll again' : 'Roll the dice';
  } else if (myTurn && view.phase === 'move' && view.dice !== null) {
    title = `You rolled a ${view.dice}`;
    subtitle =
      view.legal.length === 0
        ? 'No token can move'
        : `Tap a ${colorNameOf(view, seat, myId).toLowerCase()} token to move`;
  } else if (myTurn) {
    title = 'Your turn';
    subtitle = busy ? 'Rolling…' : null;
  } else if (view.phase === 'move' && view.dice !== null) {
    title = `${turnName} rolled a ${view.dice}`;
    subtitle = 'Waiting for their move';
  } else {
    title = `${turnName}'s turn`;
    subtitle = `${turnColor} to roll`;
  }

  const sceneLabel = `Ludo board. ${view.players
    .map((id, s) => {
      const who = id === myId ? 'You' : nameOf(id);
      return `${who} (${colorNameOf(view, s, myId)}): ${homeCount(view, s)} of ${view.tokensEach} home`;
    })
    .join('. ')}.${view.dice !== null ? ` The die shows ${view.dice}.` : ''}`;

  const overlay = (band: SceneBand) => {
    if (legal.length === 0) return null;
    const pose = cameraPose(LUDO_CAMERA, band.width, band.height);
    const pawns = layoutPawns(tokens, quads, turns);
    const nodes: ReactNode[] = [];
    for (const t of legal) {
      const pw = pawns.find((p) => p.seat === seat && p.token === t);
      if (!pw) continue;
      const c = project(pose, [pw.x, 0.55, pw.z], band.width, band.height);
      if (!c) continue;
      const pv = previewMove(view, seat, t);
      nodes.push(
        <Pressable
          key={`t${t}`}
          accessibilityRole="button"
          accessibilityLabel={`${tokenLabel(view, seat, t)}. ${pv ? previewLine(pv) : 'Move'}`}
          onPress={() => move(t)}
          style={[styles.tokenHit, { left: c.x - 24, top: c.y - 24 }]}
        >
          <View style={styles.badge}>
            <Text variant="footnote" color={INK}>
              {t + 1}
            </Text>
          </View>
        </Pressable>,
      );
    }
    return nodes;
  };

  return (
    <Stage3D
      room={ROOM}
      sceneLabel={sceneLabel}
      sceneOk={scene.ok}
      onSceneError={scene.fail}
      fallbackText="3D isn't available on this device, so here is the flat board. Playing works the same: press Roll, then pick a token in the strip under the board."
      scene={() => (
        <LudoScene
          tokens={tokens}
          quads={quads}
          colors={colors}
          quadColors={quadColors}
          turns={turns}
          mySeat={seat}
          legal={legal}
          dieValue={dieValue}
          rolling={rolling}
          event={sceneEvent}
          onDone={() => replay && done(replay.token)}
        />
      )}
      flat={(band) => (
        <LudoFlat
          width={band.width}
          height={band.height}
          tokens={view.tokens}
          quads={quads}
          colors={colors}
          quadColors={quadColors}
          turns={turns}
          mySeat={seat}
          legal={legal}
        />
      )}
      overlay={scene.ok ? overlay : undefined}
      top={
        <View style={styles.oppRow} pointerEvents="box-none">
          {foes.map(({ id, s }) => (
            <OppChip
              key={id}
              player={players.find((p) => p.userId === id) ?? null}
              name={nameOf(id)}
              color={colors[s] ?? NEUTRAL}
              line={`${colorNameOf(view, s, myId)} · ${homeCount(view, s)} home${
                !isActive(view, id) ? ' · out' : ''
              }`}
              active={!view.over && view.turn === s}
            />
          ))}
        </View>
      }
      banner={<Banner banner={banner} top={scene.ok ? 84 : 132} />}
      bottom={
        <>
          <View style={styles.strip} accessibilityLabel="Your tokens">
            {Array.from({ length: view.tokensEach }, (_, t) => {
              const p = view.tokens[seat]?.[t] ?? -1;
              const can = legal.includes(t);
              const pv = can ? previewMove(view, seat, t) : null;
              return (
                <Pressable
                  key={t}
                  disabled={!can}
                  onPress={() => move(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tokenLabel(view, seat, t)}${pv ? `. ${previewLine(pv)}` : ''}`}
                  accessibilityState={{ disabled: !can }}
                  style={[
                    styles.stripItem,
                    { borderColor: can ? BRASS : GLASS_EDGE, borderWidth: can ? 2 : 1 },
                    !can && styles.stripOff,
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: colors[seat] ?? GREEN }]}>
                    <Text variant="caption" color="#FFFFFF">
                      {t + 1}
                    </Text>
                  </View>
                  <Text variant="footnote" color={INK} numberOfLines={1}>
                    {p < 0 ? 'Yard' : p >= 56 ? 'Home' : p > 50 ? 'Home run' : `${p}/56`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <BottomBar
            me={myPlayer}
            title={title}
            titleLabel={title}
            subtitle={subtitle}
            live
            subtitleColor={moveFailed ? '#FFB59E' : SOFT}
          >
            {dieValue !== null && !(myTurn && !view.over && view.phase === 'roll' && !animating) ? (
              <DieFace value={dieValue} size={34} />
            ) : null}
            {myTurn && !view.over && view.phase === 'roll' && !animating ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Roll the dice"
                accessibilityState={{ disabled: !canRoll }}
                disabled={!canRoll}
                onPress={roll}
                style={[styles.roll, !canRoll && styles.stripOff]}
              >
                <DieFace value={dieValue ?? 5} size={28} />
                <Text variant="callout" color="#FFFFFF">
                  Roll
                </Text>
              </Pressable>
            ) : null}
          </BottomBar>
        </>
      }
    />
  );
}

function OppChip({
  player,
  name,
  color,
  line,
  active,
}: {
  player: MatchPlayer | null;
  name: string;
  color: string;
  line: string;
  active: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${line}${active ? '. Their turn' : ''}`}
      style={[styles.chip, { borderColor: active ? BRASS : GLASS_EDGE }]}
    >
      {player ? <UserAvatar avatar={player.avatar} name={name} size={34} /> : null}
      <View style={styles.chipText}>
        <View style={styles.nameRow}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text variant="callout" color={INK} numberOfLines={1} style={styles.flexShrink}>
            {name}
          </Text>
        </View>
        <Text variant="footnote" color={SOFT} numberOfLines={1}>
          {line}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  oppRow: { flex: 1, flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: GLASS,
  },
  chipText: { flexShrink: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  flexShrink: { flexShrink: 1 },
  strip: { flexDirection: 'row', gap: 8 },
  stripItem: {
    flex: 1,
    minHeight: TOUCH + 12,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 24,
    backgroundColor: GLASS,
  },
  stripOff: { opacity: 0.5 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roll: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderBottomWidth: 4,
    borderBottomColor: '#0F6B43',
  },
  tokenHit: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 2,
    borderColor: BRASS,
  },
});
