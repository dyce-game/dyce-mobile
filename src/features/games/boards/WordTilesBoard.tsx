import { memo, useCallback, type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { wordTilesWordSet, type WordTilesPremium } from '@dyce/games';
import type { MatchPlayer } from '@dyce/shared';
import { Icon, Text, TokenButton } from '@dyce/ui';
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
import { shuffledOrder } from './anagrams-logic';
import {
  SIZE,
  ZOOM_CELL,
  bagLine,
  blankNeedingLetter,
  canExchange,
  cellAtPoint,
  endingLine,
  fitCell,
  idx,
  lastMoveLine,
  lastTiles,
  lettersAt,
  pendingAt,
  placeTile,
  premiumAt,
  premiumLabel,
  previewLine,
  previewPlay,
  removeAt,
  scrollFor,
  setBlank,
  squareLabel,
  syncOrder,
  tileValue,
  toggleIn,
  toTiles,
  waitingLine,
  type Pending,
  type WordTilesView,
} from './word-tiles-logic';

/** The table is a fixed dark green panel in both themes (design: PlayScrabble and PlayScrabbleDark). */
const PREMIUM_FILL: Record<Exclude<WordTilesPremium, null>, string> = {
  TW: '#C93E1C',
  DW: '#E58A7A',
  TL: '#2457D6',
  DL: '#8DBDE8',
};
const SQUARE = '#EFE7D2';
const TILE_FILL = '#FFF0CC';
const TILE_EDGE = '#A57A3C';
const TILE_INK = '#3A2A14';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type Drag = { rackIdx: number };

/**
 * Word Tiles as a play surface: the 15 by 15 board, your rack, a live score preview and the moves (play,
 * swap, pass). Put tiles down by dragging them from the rack or by tapping a tile and then a square; tap a
 * square on the fitted board to zoom in there (squares are 44pt zoomed; on the fitted board they are about
 * 22pt, so a tap with nothing selected zooms rather than guesses). The preview runs the engine's own rules,
 * scoring and word list; the server re-checks the play and decides.
 */
export function WordTilesBoard({
  view,
  players,
  myId,
  yourTurn,
  busy,
  moveFailed,
  onMove,
}: BoardProps<WordTilesView>) {
  const reduce = useReducedMotion();
  const nameOf = useCallback((id: string | null) => playerName(players, id), [players]);
  const me = players.find((p) => p.userId === myId) ?? null;
  const rack = useMemo(() => view.rack ?? [], [view.rack]);
  const canPlay = yourTurn && !busy && !view.over;

  const [pending, setPending] = useState<Pending[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>(() => syncOrder([], rack.length));
  const [zoomed, setZoomed] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapPicks, setSwapPicks] = useState<number[]>([]);
  const [confirmPass, setConfirmPass] = useState(false);
  const [region, setRegion] = useState({ w: 0, h: 0 });
  const [notice, setNotice] = useState<string | null>(null);

  // A new move from the server (yours accepted, or theirs arrived): start the turn afresh.
  const seq = view.last?.seq ?? 0;
  useEffect(() => {
    setPending([]);
    setSelected(null);
    setSwapping(false);
    setSwapPicks([]);
    setConfirmPass(false);
    setNotice(null);
    setOrder((o) => syncOrder(o, rack.length));
  }, [seq, rack.length]);
  useEffect(() => {
    if (moveFailed) setNotice('The server didn’t accept that. Check the word list and try again.');
  }, [moveFailed]);

  const preview = useMemo(
    () => previewPlay(view.board, rack, pending, wordTilesWordSet),
    [view.board, rack, pending],
  );
  const blank = blankNeedingLetter(rack, pending);
  const last = useMemo(() => lastTiles(view), [view]);

  // ---- board geometry
  const fit = fitCell(Math.min(region.w - 16, region.h - 8));
  const cell = zoomed ? ZOOM_CELL : fit;
  const boardPx = cell * SIZE;
  const gridRef = useRef<ComponentRef<typeof View>>(null);
  const hRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const vRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const focus = useRef<{ r: number; c: number } | null>(null);

  const zoomTo = useCallback((r: number, c: number) => {
    focus.current = { r, c };
    setZoomed(true);
  }, []);
  useEffect(() => {
    if (!zoomed) return;
    const f = focus.current ?? { r: 7, c: 7 };
    const pos = scrollFor(f.r, f.c, ZOOM_CELL, region.w, region.h);
    // The scroll views have just mounted: scroll once they have their size, and again in case they were late.
    const go = () => {
      hRef.current?.scrollTo({ x: pos.x, y: 0, animated: false });
      vRef.current?.scrollTo({ x: 0, y: pos.y, animated: false });
    };
    const timers = [0, 80, 250].map((ms) => setTimeout(go, ms));
    return () => timers.forEach(clearTimeout);
  }, [zoomed, region.w, region.h, reduce]);

  const onRegion = (e: LayoutChangeEvent) =>
    setRegion({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // ---- tiles
  const putOn = useCallback(
    (rackIdx: number, r: number, c: number) => {
      const next = placeTile(pending, view.board, rack, rackIdx, r, c);
      if (!next) return;
      setPending(next);
      setSelected(null);
      setNotice(null);
    },
    [pending, view.board, rack],
  );

  const onSquare = useCallback(
    (r: number, c: number) => {
      if (!canPlay || swapping) {
        if (!zoomed) zoomTo(r, c);
        return;
      }
      const mine = pendingAt(pending, r, c);
      if (mine) {
        setPending(removeAt(pending, r, c));
        setNotice(null);
        return;
      }
      if (view.board[idx(r, c)] !== '') return;
      if (selected !== null) putOn(selected, r, c);
      else if (!zoomed) zoomTo(r, c);
    },
    [canPlay, swapping, zoomed, zoomTo, pending, view.board, selected, putOn],
  );

  // ---- dragging a rack tile onto the board
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostOn = useSharedValue(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const stageRef = useRef<ComponentRef<typeof View>>(null);
  const stageOrigin = useRef({ x: 0, y: 0 });

  const dragStart = useCallback(
    (rackIdx: number, x: number, y: number) => {
      stageRef.current?.measureInWindow((sx, sy) => {
        stageOrigin.current = { x: sx, y: sy };
        ghostX.value = x - sx;
        ghostY.value = y - sy;
      });
      setDrag({ rackIdx });
      ghostOn.value = 1;
    },
    [ghostOn, ghostX, ghostY],
  );
  const dragMove = useCallback(
    (x: number, y: number) => {
      ghostX.value = x - stageOrigin.current.x;
      ghostY.value = y - stageOrigin.current.y;
    },
    [ghostX, ghostY],
  );
  const dragEnd = useCallback(
    (rackIdx: number, x: number, y: number) => {
      ghostOn.value = 0;
      setDrag(null);
      gridRef.current?.measureInWindow((gx, gy) => {
        const at = cellAtPoint(x - gx, y - gy, cell);
        if (at) putOn(rackIdx, at.r, at.c);
      });
    },
    [cell, ghostOn, putOn],
  );
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.value,
    transform: [{ translateX: ghostX.value - 24 }, { translateY: ghostY.value - 56 }],
  }));

  // ---- moves
  const play = () => {
    const tiles = toTiles(rack, pending);
    if (tiles) onMove({ kind: 'play', tiles });
  };
  const swap = () => onMove({ kind: 'exchange', letters: lettersAt(rack, swapPicks) });
  const pass = () => onMove({ kind: 'pass' });

  const recall = () => {
    setPending([]);
    setSelected(null);
    setNotice(null);
  };

  // ---- status line
  const mover = view.turn;
  const status = (() => {
    if (view.over) return { title: 'Game over', sub: null as string | null, color: SOFT };
    if (!yourTurn) {
      return {
        title: waitingLine(view, (id) => nameOf(id)),
        sub: lastMoveLine(view, myId, (id) => nameOf(id)),
        color: SOFT,
      };
    }
    if (swapping) {
      return {
        title: canExchange(view) ? `Swap ${swapPicks.length} tiles` : 'Swap not available',
        sub: canExchange(view)
          ? 'Tap the tiles to swap, then press Swap'
          : 'Swapping needs 7 or more tiles in the bag',
        color: SOFT,
      };
    }
    if (blank) return { title: 'Blank tile', sub: 'Choose the letter it stands for', color: BRASS };
    if (preview.kind === 'ok') {
      return { title: previewLine(preview) ?? 'A play', sub: 'Press Play to send it', color: GOOD };
    }
    if (preview.kind === 'error') {
      return { title: 'Not a play yet', sub: preview.message, color: WARN };
    }
    const ending = endingLine(view, view.players.length);
    return {
      title: `Your turn · ${rack.length} tiles`,
      sub:
        notice ??
        (selected !== null
          ? 'Now tap a square'
          : (lastMoveLine(view, myId, (id) => nameOf(id)) ??
            'Drag tiles to the board, or tap one then a square')) + (ending ? ` · ${ending}` : ''),
      color: SOFT,
    };
  })();

  const invalidOnly = preview.kind === 'error' && preview.code === 'invalid_word';
  const playable = canPlay && (preview.kind === 'ok' || invalidOnly);

  return (
    <View ref={stageRef} style={styles.stage} collapsable={false}>
      <View style={styles.top}>
        <ScoreRow view={view} myId={myId} players={players} mover={mover} />
        <View style={styles.topLine}>
          <Text variant="footnote" color={SOFT} numberOfLines={1} style={styles.flex}>
            {bagLine(view.bagCount)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={zoomed ? 'Show the whole board' : 'Zoom in on the board'}
            onPress={() => (zoomed ? setZoomed(false) : zoomTo(7, 7))}
            style={[styles.zoomBtn, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}
          >
            <Text variant="callout" color={INK}>
              {zoomed ? 'Fit board' : 'Zoom'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.region} onLayout={onRegion}>
        {region.w > 0 ? (
          zoomed ? (
            <ScrollView
              ref={hRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              style={styles.fill}
            >
              <ScrollView
                ref={vRef}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                style={{ width: boardPx + 8 }}
                contentContainerStyle={{ padding: 4 }}
              >
                <View ref={gridRef} collapsable={false}>
                  <Grid
                    view={view}
                    rack={rack}
                    pending={pending}
                    last={last}
                    cell={cell}
                    onSquare={onSquare}
                  />
                </View>
              </ScrollView>
            </ScrollView>
          ) : (
            <View style={styles.fitWrap}>
              <View ref={gridRef} collapsable={false} style={styles.frame}>
                <Grid
                  view={view}
                  rack={rack}
                  pending={pending}
                  last={last}
                  cell={cell}
                  onSquare={onSquare}
                />
              </View>
            </View>
          )
        ) : null}
      </View>

      {blank ? (
        <BlankPicker
          onPick={(letter) => setPending(setBlank(pending, blank.r, blank.c, letter))}
          onCancel={() => setPending(removeAt(pending, blank.r, blank.c))}
        />
      ) : null}

      <RackRow
        rack={rack}
        order={order}
        pending={pending}
        selected={selected}
        swapPicks={swapPicks}
        swapping={swapping}
        enabled={canPlay}
        dragging={drag?.rackIdx ?? null}
        onTap={(i) => {
          if (swapping) setSwapPicks(toggleIn(swapPicks, i));
          else setSelected(selected === i ? null : i);
        }}
        onDragStart={dragStart}
        onDragMove={dragMove}
        onDragEnd={dragEnd}
      />

      <View style={styles.tools}>
        <ToolButton
          label="Shuffle"
          a11y="Shuffle the rack"
          icon
          onPress={() => setOrder(shuffledOrder(rack.length, Math.random))}
          disabled={rack.length < 2}
        />
        {pending.length > 0 ? (
          <ToolButton label="Recall" a11y="Take all your tiles back to the rack" onPress={recall} />
        ) : (
          <ToolButton
            label={swapping ? 'Cancel swap' : 'Swap'}
            a11y={swapping ? 'Cancel swapping tiles' : 'Swap some of your tiles for new ones'}
            onPress={() => {
              setSwapping(!swapping);
              setSwapPicks([]);
              setSelected(null);
              setConfirmPass(false);
            }}
            disabled={!canPlay}
          />
        )}
        {confirmPass ? (
          <ToolButton
            label="Cancel"
            a11y="Keep playing, do not pass"
            onPress={() => setConfirmPass(false)}
          />
        ) : (
          <ToolButton
            label="Pass"
            a11y="Pass your turn"
            onPress={() => {
              setConfirmPass(true);
              setSwapping(false);
            }}
            disabled={!canPlay || pending.length > 0}
          />
        )}
      </View>

      <BottomBar
        me={me}
        title={status.title}
        subtitle={status.sub}
        subtitleColor={status.color}
        live
        style={styles.bar}
      >
        {confirmPass ? (
          <TokenButton
            label={busy ? 'Passing…' : 'Pass turn'}
            accessibilityLabel="Confirm: pass my turn"
            tone="ember"
            disabled={!canPlay}
            onPress={pass}
            style={styles.main}
          />
        ) : swapping ? (
          <TokenButton
            label={busy ? 'Swapping…' : 'Swap'}
            accessibilityLabel={`Swap ${swapPicks.length} tiles`}
            tone="ember"
            disabled={!canPlay || swapPicks.length === 0 || !canExchange(view)}
            onPress={swap}
            style={styles.main}
          />
        ) : (
          <TokenButton
            label={busy ? 'Sending…' : invalidOnly ? 'Try it' : 'Play'}
            accessibilityLabel={
              invalidOnly
                ? 'Send this play anyway. The server checks the word list.'
                : 'Play these tiles'
            }
            tone="ember"
            disabled={!playable}
            onPress={play}
            style={styles.main}
          />
        )}
      </BottomBar>

      <Animated.View pointerEvents="none" style={[styles.ghost, ghostStyle]}>
        {drag ? <TileFace ch={rack[drag.rackIdx] ?? ''} size={48} /> : null}
      </Animated.View>
    </View>
  );
}

// ---- scores --------------------------------------------------------------------------------------------

function ScoreRow({
  view,
  myId,
  players,
  mover,
}: {
  view: WordTilesView;
  myId: string | null;
  players: MatchPlayer[];
  mover: string | null;
}) {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return (
    <View style={styles.scores}>
      {order.map((id) => {
        const p = players.find((x) => x.userId === id) ?? null;
        const name = id === myId ? 'You' : playerName(players, id);
        const turn = id === mover;
        return (
          <PlayerChip
            key={id}
            player={p}
            name={name}
            line={`${name} ${view.scores[id] ?? 0}`}
            style={turn ? styles.turnChip : null}
          />
        );
      })}
    </View>
  );
}

// ---- the board -----------------------------------------------------------------------------------------

type GridProps = {
  view: WordTilesView;
  rack: string[];
  pending: Pending[];
  last: Set<number>;
  cell: number;
  onSquare: (r: number, c: number) => void;
};

/** The 225 squares. Memoised: it redraws when the board, your pending tiles or the size change, not on a drag. */
const Grid = memo(function Grid({ view, rack, pending, last, cell, onSquare }: GridProps) {
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const cells = [];
    for (let c = 0; c < SIZE; c++) {
      const p = pendingAt(pending, r, c);
      const pch = p
        ? rack[p.rackIdx] === '?'
          ? p.letter
            ? p.letter.toLowerCase()
            : '?'
          : (rack[p.rackIdx] ?? '')
        : '';
      cells.push(
        <Square
          key={c}
          r={r}
          c={c}
          cell={cell}
          ch={view.board[idx(r, c)] ?? ''}
          pendingCh={pch}
          isPending={!!p}
          isLast={last.has(idx(r, c))}
          onSquare={onSquare}
        />,
      );
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return (
    <View
      accessible={false}
      style={[styles.grid, { width: cell * SIZE + 2, borderRadius: Math.min(8, cell / 3) }]}
    >
      {rows}
    </View>
  );
});

const Square = memo(function Square({
  r,
  c,
  cell,
  ch,
  pendingCh,
  isPending,
  isLast,
  onSquare,
}: {
  r: number;
  c: number;
  cell: number;
  ch: string;
  pendingCh: string;
  isPending: boolean;
  isLast: boolean;
  onSquare: (r: number, c: number) => void;
}) {
  const premium = premiumAt(r, c);
  const bg = premium ? PREMIUM_FILL[premium] : SQUARE;
  const shown = isPending ? pendingCh : ch;
  const label = premiumLabel(premium, r, c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={squareLabel(r, c, ch, isPending ? pendingCh.toUpperCase() : null)}
      onPress={() => onSquare(r, c)}
      style={[styles.square, { width: cell, height: cell, backgroundColor: bg }]}
    >
      {shown ? (
        <TileFace
          ch={shown}
          size={cell - 2}
          fill={isPending ? '#FFD9C9' : TILE_FILL}
          ring={isPending ? '#C93E1C' : isLast ? '#E3A93B' : null}
        />
      ) : label ? (
        <Text
          allowFontScaling={false}
          style={[styles.premium, { fontSize: Math.max(7, cell * 0.36) }]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
});

/** A letter tile. A lower-case letter is a blank standing for it (shown with no value). */
function TileFace({
  ch,
  size,
  fill = TILE_FILL,
  ring = null,
}: {
  ch: string;
  size: number;
  fill?: string;
  ring?: string | null;
}) {
  const value = tileValue(ch);
  const isBlank = ch === '?' || ch === ch.toLowerCase();
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(2, size * 0.14),
          backgroundColor: fill,
          boxShadow: `0px ${Math.max(1, Math.round(size * 0.07))}px 0px ${TILE_EDGE}`,
          borderWidth: ring ? Math.max(1.5, size * 0.06) : 0,
          borderColor: ring ?? 'transparent',
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.tileLetter,
          { fontSize: size * 0.58, color: isBlank && ch !== '?' ? '#7A4A00' : TILE_INK },
        ]}
      >
        {ch === '?' ? '' : ch.toUpperCase()}
      </Text>
      {size >= 30 && !isBlank ? (
        <Text allowFontScaling={false} style={[styles.tileValue, { fontSize: size * 0.24 }]}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

// ---- the rack ------------------------------------------------------------------------------------------

function RackRow({
  rack,
  order,
  pending,
  selected,
  swapPicks,
  swapping,
  enabled,
  dragging,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  rack: string[];
  order: number[];
  pending: Pending[];
  selected: number | null;
  swapPicks: number[];
  swapping: boolean;
  enabled: boolean;
  dragging: number | null;
  onTap: (i: number) => void;
  onDragStart: (i: number, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (i: number, x: number, y: number) => void;
}) {
  return (
    <View
      style={styles.rack}
      accessible={false}
      accessibilityLabel={`Your rack: ${rack.map((c) => (c === '?' ? 'blank' : c)).join(', ')}`}
    >
      {order.map((i) => {
        const ch = rack[i];
        if (ch === undefined) return null;
        const placed = pending.some((p) => p.rackIdx === i);
        return (
          <RackTile
            key={i}
            ch={ch}
            index={i}
            placed={placed}
            selected={selected === i || swapPicks.includes(i)}
            lifted={dragging === i}
            enabled={enabled}
            swapping={swapping}
            onTap={onTap}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </View>
  );
}

const TAP_SLOP = 8;

function RackTile({
  ch,
  index,
  placed,
  selected,
  lifted,
  enabled,
  swapping,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  ch: string;
  index: number;
  placed: boolean;
  selected: boolean;
  lifted: boolean;
  enabled: boolean;
  swapping: boolean;
  onTap: (i: number) => void;
  onDragStart: (i: number, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (i: number, x: number, y: number) => void;
}) {
  const live = useRef({
    index,
    enabled,
    swapping,
    placed,
    onTap,
    onDragStart,
    onDragMove,
    onDragEnd,
  });
  live.current = { index, enabled, swapping, placed, onTap, onDragStart, onDragMove, onDragEnd };
  const dragging = useRef(false);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.enabled && !live.current.placed,
        onMoveShouldSetPanResponder: () => live.current.enabled && !live.current.placed,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragging.current = false;
        },
        onPanResponderMove: (_e, g) => {
          const L = live.current;
          if (L.swapping) return;
          if (!dragging.current && Math.hypot(g.dx, g.dy) > TAP_SLOP) {
            dragging.current = true;
            L.onDragStart(L.index, g.x0 + g.dx, g.y0 + g.dy);
          } else if (dragging.current) {
            L.onDragMove(g.moveX, g.moveY);
          }
        },
        onPanResponderRelease: (_e, g) => {
          const L = live.current;
          if (dragging.current) {
            dragging.current = false;
            L.onDragEnd(L.index, g.moveX, g.moveY);
          } else {
            L.onTap(L.index);
          }
        },
        onPanResponderTerminate: (_e, g) => {
          const L = live.current;
          if (dragging.current) {
            dragging.current = false;
            L.onDragEnd(L.index, g.moveX, g.moveY);
          }
        },
      }),
    [],
  );
  const webOnly =
    Platform.OS === 'web'
      ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as object)
      : null;
  const name = ch === '?' ? 'blank' : ch;
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        placed
          ? `${name}, on the board`
          : swapping
            ? `Tile ${name}${selected ? ', chosen for swapping' : ''}. Tap to choose it.`
            : `Tile ${name}${selected ? ', selected' : ''}. Tap to select, then tap a square, or drag it.`
      }
      accessibilityState={{ selected, disabled: !enabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => live.current.onTap(live.current.index)}
      style={[
        styles.rackSlot,
        placed ? styles.rackEmpty : null,
        selected ? styles.rackSelected : null,
        lifted ? { opacity: 0.35 } : null,
        webOnly,
      ]}
    >
      {placed ? null : (
        <TileFace ch={ch} size={44} fill="#FFF3D6" ring={selected ? '#C93E1C' : null} />
      )}
    </View>
  );
}

// ---- small pieces --------------------------------------------------------------------------------------

function ToolButton({
  label,
  a11y,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tool,
        { backgroundColor: GLASS, borderColor: GLASS_EDGE, opacity: disabled ? 0.45 : 1 },
      ]}
    >
      {icon ? <Icon name="shuffle" color={INK} size={18} /> : null}
      <Text variant="callout" color={INK}>
        {label}
      </Text>
    </Pressable>
  );
}

function BlankPicker({
  onPick,
  onCancel,
}: {
  onPick: (letter: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={[styles.picker, { backgroundColor: GLASS, borderColor: GLASS_EDGE }]}>
      <View style={styles.pickerHead}>
        <Text variant="callout" color={INK} accessibilityRole="header">
          The blank stands for…
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel, take the blank back"
          onPress={onCancel}
          style={styles.pickerCancel}
        >
          <Text variant="callout" color={BRASS}>
            Cancel
          </Text>
        </Pressable>
      </View>
      <View style={styles.letters}>
        {LETTERS.map((l) => (
          <Pressable
            key={l}
            accessibilityRole="button"
            accessibilityLabel={`Letter ${l}`}
            onPress={() => onPick(l)}
            style={styles.letterBtn}
          >
            <Text variant="callout" color={TILE_INK}>
              {l}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0F1C16' },
  flex: { flex: 1 },
  fill: { flex: 1 },
  top: { paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  turnChip: { borderColor: '#E3A93B', borderWidth: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomBtn: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  region: { flex: 1, minHeight: 150, overflow: 'hidden' },
  fitWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#2E6A52',
    boxShadow: '0px 12px 18px rgba(0,0,0,0.5)',
  },
  grid: { backgroundColor: '#CFC6AE', overflow: 'hidden', borderWidth: 1, borderColor: '#CFC6AE' },
  row: { flexDirection: 'row' },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CFC6AE',
  },
  premium: { color: 'rgba(255,255,255,0.92)', fontWeight: '900' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  tileLetter: { fontFamily: 'BricolageGrotesque_800ExtraBold' },
  tileValue: { position: 'absolute', right: 3, bottom: 1, color: TILE_INK, fontWeight: '800' },
  rack: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: 10,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: '#6B4220',
    boxShadow: '0px 5px 0px #3A200C',
  },
  rackSlot: {
    width: 44,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  rackEmpty: { backgroundColor: 'rgba(0,0,0,0.25)' },
  rackSelected: { transform: [{ translateY: -8 }] },
  tools: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    justifyContent: 'center',
  },
  tool: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { margin: 10 },
  main: { minWidth: 92 },
  ghost: { position: 'absolute', left: 0, top: 0, zIndex: 20 },
  picker: {
    marginHorizontal: 10,
    marginTop: 6,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerCancel: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  letterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: TILE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
