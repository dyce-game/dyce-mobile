import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { formatNaira, type LiveState, type SpaceView } from '@dyce/shared';
import { Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { Canvas } from '@/features/games/boards/r3f';
import { WhotTable } from '../components/WhotTable';
import type { LiveStatus } from '../live-connection';
import { secondsLeft } from '../whot-logic';
import { CardTableScene } from './CardTableScene';
import {
  CardList,
  Chooser,
  GLASS,
  GLASS_EDGE,
  MiniCard,
  ON_TABLE,
  ResultsPanel,
  SOFT,
  SeatChip,
  TableHeader,
} from './CardTableParts';
import { cuesFor, headline, type Cue } from './cues';
import { TableDirector } from './director';
import { COLOR_NAME } from './faces';
import {
  CARD_H,
  DECK_AT,
  DISCARD_AT,
  TABLE_R,
  cameraRig,
  chipLayout,
  handLayout,
  onTable,
  projectPct,
  seatPhi,
} from './layout';
import {
  buildTableModel,
  choiceNeeded,
  drawMove,
  eventLine,
  inForceLine,
  mostHeld,
  passMove,
  playMove,
  type TableModel,
} from './model';
import { useScreenReader, useWebGL } from './use-gl';

export type CardTableProps = {
  space: SpaceView;
  myId: string;
  live: LiveState;
  status: LiveStatus;
  /** Local time `live` arrived (for the turn clock). */
  receivedAt: number;
  /** The server's last refusal, if any. */
  errorCode: string | null;
  onMove: (action: unknown) => boolean;
  onForfeit: () => void;
  onBack: () => void;
  /** Move on to the space's results. */
  onContinue: () => void;
};

/** The table is a fixed dark room in both themes, as in the design. */
const ROOM: Record<string, string> = { whot: '#120A06', 'crazy-cards': '#0B1714' };

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Catches a GL context that fails or dies, so the table drops to the flat one instead of a blank screen. */
class GLBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The live card table for Whot! and Crazy Cards: a round 3D table with your hand fanned in front of you
 * (React Three Fiber), and, when 3D is not available, the existing flat Whot! table or the card list for
 * Crazy Cards. See `CardTableScreen` for the table itself.
 */
export function CardTable(props: CardTableProps) {
  const gl = useWebGL();
  const [failed, setFailed] = useState(false);
  if (props.space.gameSlug === 'whot' && (!gl || failed)) return <FlatWhot {...props} />;
  return <CardTableScreen {...props} noGL={!gl || failed} onGLFail={() => setFailed(true)} />;
}

/** The existing 2D Whot! table, with the move to the results that the 3D table does with its results panel. */
function FlatWhot(props: CardTableProps) {
  const { live, onContinue } = props;
  const finished = live.status === 'finished';
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(onContinue, 2500);
    return () => clearTimeout(id);
  }, [finished, onContinue]);
  return <WhotTable {...props} />;
}

function errorText(code: string): string {
  switch (code.split(':')[0]) {
    case 'not_your_turn':
      return "It isn't your turn.";
    case 'illegal_move':
    case 'card_not_playable':
      return "That card can't be played now.";
    case 'forfeited':
      return 'You left this game.';
    case 'not_running':
      return 'This game is over.';
    default:
      return "That didn't work. Try again.";
  }
}

const QUIET = new Set(['stale_version']);

function CardTableScreen({
  space,
  myId,
  live,
  status,
  receivedAt,
  errorCode,
  onMove,
  onForfeit,
  onBack,
  onContinue,
  noGL,
  onGLFail,
}: CardTableProps & { noGL: boolean; onGLFail: () => void }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const screenReader = useScreenReader();
  const now = useNow(500);
  const [size, setSize] = useState({ width: 390, height: 844 });
  const [pickedIndex, setPicked] = useState(-1);
  const [sending, setSending] = useState(false);
  const [chooser, setChooser] = useState<{ index: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [listOn, setListOn] = useState(false);
  const [flatChoice, setFlatChoice] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<Cue | null>(null);
  const [pulse, setPulse] = useState<{ seat: string; at: number; color: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [actorsVersion, setActorsVersion] = useState(0);
  const flat = flatChoice ?? (noGL || screenReader);

  const nameOf = useCallback(
    (id: string): string => {
      if (id === myId) return 'You';
      const m = space.members.find((x) => x.userId === id);
      return m?.displayName || m?.username || 'Player';
    },
    [space.members, myId],
  );

  const model = useMemo(
    () => buildTableModel(space.gameSlug, live, myId, nameOf),
    [space.gameSlug, live, myId, nameOf],
  );
  const rig = useMemo(
    () => cameraRig(size.width / Math.max(1, size.height)),
    [size.width, size.height],
  );

  const director = useRef<TableDirector | null>(null);
  if (!director.current) director.current = new TableDirector(reduced);
  const dir = director.current;
  dir.setReduced(reduced);
  if (__DEV__) (globalThis as { __cardTableDirector?: unknown }).__cardTableDirector = dir;

  // ---- the director follows the table ----
  useEffect(() => {
    if (!model || flat) return;
    dir.update(model, rig, performance.now(), pickedIndex);
    setActorsVersion((v) => v + 1);
  }, [model, flat]);
  useEffect(() => {
    if (!model || flat) return;
    dir.relayoutHand(model, rig, performance.now(), pickedIndex);
    setActorsVersion((v) => v + 1);
  }, [rig, pickedIndex]);

  // Dev only: where each card of your hand is on screen, for scripted checks in the browser.
  useEffect(() => {
    if (!__DEV__ || !model) return;
    const slots = handLayout(model.hand.length, rig, { picked: pickedIndex });
    (globalThis as { __cardTableDev?: unknown }).__cardTableDev = {
      myTurn: model.myTurn,
      canPass: model.canPass,
      picked: pickedIndex,
      hand: model.hand.map((h, i) => {
        const p = projectPct(rig, [slots[i]!.x, slots[i]!.y, slots[i]!.z]);
        return {
          i,
          label: h.face.label,
          key: h.face.key,
          playable: h.playable,
          x: (p.left / 100) * size.width,
          y: (p.top / 100) * size.height,
        };
      }),
    };
  }, [model, rig, pickedIndex, size.width, size.height]);

  // ---- a new table: unlock the buttons, drop what is no longer true ----
  useEffect(() => setSending(false), [live.version, errorCode]);
  const myTurn = model?.myTurn ?? false;
  useEffect(() => {
    if (!myTurn) {
      setPicked(-1);
      setChooser(null);
    }
  }, [myTurn, live.version]);
  useEffect(() => setPicked(-1), [live.version]);

  // your turn: a light tap
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // ---- special-card feedback ----
  const prevModel = useRef<TableModel | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!model) return;
    const cues = cuesFor(prevModel.current, model, nameOf);
    prevModel.current = model;
    const top = headline(cues);
    if (!top) return;
    setBanner(top);
    if (top.seat)
      setPulse({
        seat: top.seat,
        at: performance.now(),
        color: top.kind === 'last_card' ? '#E3A93B' : '#FF6B4A',
      });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner((b) => (b === top ? null : b)), 2800);
  }, [model, nameOf]);
  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(id);
  }, [hint]);

  if (!model) {
    return (
      <View
        style={[styles.root, styles.center, { backgroundColor: ROOM[space.gameSlug] ?? '#120A06' }]}
      >
        <Text style={{ color: ON_TABLE }}>The table couldn&apos;t be read. Try again.</Text>
        <TokenButton label="Back" tone="chip" onPress={onBack} />
      </View>
    );
  }

  const me = model.seats[0]!;
  const canMove = model.myTurn && !sending && status === 'live' && !me.forfeited;
  const picked = pickedIndex >= 0 ? (model.hand[pickedIndex] ?? null) : null;
  const left = live.status === 'live' ? secondsLeft(live, receivedAt, now) : null;
  const playableCount = model.hand.filter((h) => h.playable).length;
  const turnSeat = model.seats.find((s) => s.current);

  const send = (action: unknown) => {
    if (onMove(action)) setSending(true);
  };
  const tapCard = (index: number) => {
    const card = model.hand[index];
    if (!card) return;
    if (!model.myTurn) return setHint('Wait for your turn');
    if (!card.playable) return setHint(`${card.face.label} can't be played now`);
    void Haptics.selectionAsync().catch(() => undefined);
    setPicked(index === pickedIndex ? -1 : index);
  };
  const playIndex = (index: number) => {
    const card = model.hand[index];
    if (!card || !canMove || !card.playable) return;
    const need = choiceNeeded(card.face);
    setListOn(false);
    if (need) return setChooser({ index });
    setPicked(-1);
    send(playMove(model, card.face));
  };
  const choose = (choice: string) => {
    const c = chooser ? model.hand[chooser.index] : null;
    setChooser(null);
    setPicked(-1);
    if (c) send(playMove(model, c.face, choice));
  };
  const draw = () => {
    if (canMove && model.canDraw) send(drawMove());
  };
  const pass = () => {
    if (canMove && model.canPass) send(passMove());
  };
  const pickFromScene = (actorId: string) => {
    const i = dir.handIds().indexOf(actorId);
    if (i >= 0) tapCard(i);
  };

  if (__DEV__) {
    // Dev only: lets a script in the browser make the same moves a tap would (same handlers).
    (globalThis as { __cardTableApi?: unknown }).__cardTableApi = {
      tap: tapCard,
      play: playIndex,
      draw,
      pass,
      choose,
      chooser: chooser ? (choiceNeeded(model.hand[chooser.index]!.face) ?? 'color') : null,
      canMove,
    };
  }

  const statusText = (() => {
    if (me.forfeited) return 'You left this game';
    if (model.over) return 'Game over';
    if (!model.myTurn) return `${turnSeat ? turnSeat.name : 'Someone'} is playing`;
    if (picked) return `Play ${picked.face.label}?`;
    if (model.canPass) return 'Play it, or pass';
    if (model.pending) return `Pick ${model.pending.total} or play a ${model.pending.n}`;
    return playableCount > 0
      ? `Your turn · ${playableCount} playable`
      : `Your turn · ${model.drawLabel.toLowerCase()}`;
  })();

  const cta = (() => {
    if (model.over || live.status !== 'live') return null;
    if (picked)
      return { label: 'Play card', tone: 'ember' as const, run: () => playIndex(pickedIndex) };
    if (model.canPass) return { label: 'Pass', tone: 'chip' as const, run: pass };
    return { label: model.drawLabel, tone: 'chip' as const, run: draw };
  })();

  const opponents = model.seats.filter((s) => s.index > 0);
  const centreLabel = `Card in play: ${model.top.label}.${inForceLine(model) ? ` ${inForceLine(model)}.` : ''} ${model.deckCount} ${model.deckCount === 1 ? 'card' : 'cards'} left to draw.`;
  const line = eventLine(model, nameOf, live.view);
  const pct = (p: [number, number, number]) => projectPct(rig, p);
  const chips = chipLayout(
    opponents.map((s) => pct(onTable(seatPhi(s.index, model.seats.length), TABLE_R + 0.16, 0.25))),
    size.width,
  );
  const deckLabelAt = pct([DECK_AT[0], 0.03, DECK_AT[2] + CARD_H * 0.62]);
  const discardLabelAt = pct([DISCARD_AT[0], 0.03, DISCARD_AT[2] + CARD_H * 0.62]);
  const forceAt = pct([0, 0.03, -0.64]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (
      width > 0 &&
      height > 0 &&
      (Math.abs(width - size.width) > 1 || Math.abs(height - size.height) > 1)
    ) {
      setSize({ width, height });
    }
  };

  return (
    <View
      style={[styles.root, { backgroundColor: ROOM[space.gameSlug] ?? '#120A06' }]}
      onLayout={onLayout}
    >
      {!flat ? (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <GLBoundary onFail={onGLFail}>
            <Canvas
              frameloop="demand"
              flat
              gl={{ antialias: true }}
              camera={{ fov: rig.fov, near: 0.4, far: 40 }}
            >
              <CardTableScene
                game={model.game}
                director={dir}
                actorsVersion={actorsVersion}
                rig={rig}
                selectedId={pickedIndex >= 0 ? (dir.handIds()[pickedIndex] ?? null) : null}
                dimUnplayable={model.myTurn}
                playableKeys={new Set(model.hand.filter((h) => h.playable).map((h) => h.face.key))}
                seats={model.seats.map((s) => ({ id: s.id, index: s.index, current: s.current }))}
                colorInForce={model.colorInForce}
                askedShape={model.askedShape}
                deckCount={model.deckCount}
                direction={model.direction}
                pulse={pulse}
                reduced={reduced}
                onPick={pickFromScene}
                onDeck={draw}
                onPruned={() => setActorsVersion((v) => v + 1)}
              />
            </Canvas>
          </GLBoundary>
        </View>
      ) : null}

      <SafeAreaView style={styles.fill} edges={['top', 'bottom']} pointerEvents="box-none">
        <TableHeader
          space={space}
          onBack={onBack}
          onList={() => setListOn((v) => !v)}
          listOn={listOn && !flat}
          showList={!flat}
          onMenu={() => setMenu(true)}
        />

        {status !== 'live' ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.banner,
              { backgroundColor: status === 'replaced' ? '#8A2410' : '#A86F12' },
            ]}
          >
            <Text variant="footnote" style={{ color: ON_TABLE }}>
              {status === 'replaced'
                ? 'This table is open on another device.'
                : status === 'ended'
                  ? 'This table has closed.'
                  : 'Reconnecting… your seat is kept for a minute.'}
            </Text>
          </View>
        ) : null}

        {banner ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.cue}
            pointerEvents="none"
          >
            <Text variant="callout" style={styles.cueText}>
              {banner.text}
            </Text>
          </View>
        ) : null}

        {flat ? (
          <FlatTable
            model={model}
            space={space}
            nameOf={nameOf}
            line={line}
            listProps={{
              hand: model.hand,
              myTurn: canMove,
              drawLabel: model.drawLabel,
              canDraw: canMove && model.canDraw,
              canPass: canMove && model.canPass,
              pickedIndex,
              onPlay: playIndex,
              onDraw: draw,
              onPass: pass,
              sheet: false,
              onClose: () => undefined,
            }}
          />
        ) : (
          <View style={styles.fill} pointerEvents="box-none" />
        )}

        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.ruleRow} pointerEvents="box-none">
            <View style={styles.rule}>
              <Text variant="footnote" style={{ color: ON_TABLE }} numberOfLines={2}>
                {hint ?? model.ruleLine}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View
              style={styles.statusPill}
              accessibilityLiveRegion="polite"
              accessible
              accessibilityLabel={`${statusText}${left !== null ? `, ${left} seconds left` : ''}`}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: model.myTurn ? brand.brass.fill : '#8C8279' },
                ]}
              />
              <View style={styles.fill}>
                <Text variant="callout" style={{ color: ON_TABLE }} numberOfLines={1}>
                  {statusText}
                </Text>
                {left !== null && !model.over ? (
                  <Text variant="footnote" style={{ color: SOFT }}>
                    {left}s left
                  </Text>
                ) : null}
              </View>
            </View>
            {cta ? (
              <TokenButton
                label={cta.label}
                tone={cta.tone}
                disabled={
                  !canMove || (cta.label !== 'Play card' && cta.label !== 'Pass' && !model.canDraw)
                }
                onPress={cta.run}
                style={styles.cta}
              />
            ) : null}
          </View>
          {model.canPass && picked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pass"
              onPress={pass}
              style={styles.passLink}
            >
              <Text variant="callout" style={{ color: ON_TABLE }}>
                Pass instead
              </Text>
            </Pressable>
          ) : null}
          {errorCode && !QUIET.has(errorCode.split(':')[0] ?? '') ? (
            <Text variant="footnote" style={styles.error} accessibilityRole="alert">
              {errorText(errorCode)}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      {/* labels that sit on the 3D table (they follow it, so they are drawn from the same camera) */}
      {!flat ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {opponents.map((s, k) => {
            const at = chips[k]!;
            const member = space.members.find((m) => m.userId === s.id);
            return (
              <SeatChip
                key={s.id}
                seat={s}
                member={member}
                left={at.left}
                top={at.top}
                width={at.width}
                game={model.game}
              />
            );
          })}
          <View
            accessible
            accessibilityLabel={centreLabel}
            style={[styles.centreLabel, { left: `${forceAt.left}%`, top: `${forceAt.top}%` }]}
          >
            {inForceLine(model) ? (
              <View style={styles.forceChip}>
                <Text variant="footnote" style={{ color: ON_TABLE }}>
                  {inForceLine(model)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            variant="caption"
            style={[styles.pileLabel, { left: `${deckLabelAt.left}%`, top: `${deckLabelAt.top}%` }]}
          >
            {model.game === 'whot' ? 'MARKET' : 'DRAW'} · {model.deckCount}
          </Text>
          <Text
            variant="caption"
            style={[
              styles.pileLabel,
              { left: `${discardLabelAt.left}%`, top: `${discardLabelAt.top}%` },
            ]}
          >
            IN PLAY
          </Text>
        </View>
      ) : null}

      {listOn && !flat ? (
        <CardList
          hand={model.hand}
          myTurn={canMove}
          drawLabel={model.drawLabel}
          canDraw={canMove && model.canDraw}
          canPass={canMove && model.canPass}
          pickedIndex={pickedIndex}
          onPlay={playIndex}
          onDraw={() => {
            setListOn(false);
            draw();
          }}
          onPass={() => {
            setListOn(false);
            pass();
          }}
          sheet
          onClose={() => setListOn(false)}
        />
      ) : null}

      {chooser ? (
        <Chooser
          kind={choiceNeeded(model.hand[chooser.index]!.face) ?? 'color'}
          initial={mostHeld(model.hand, model.game)}
          onPick={choose}
          onCancel={() => setChooser(null)}
        />
      ) : null}

      {model.over ? (
        <ResultsPanel
          model={model}
          space={space}
          results={live.results}
          myId={myId}
          onContinue={onContinue}
        />
      ) : null}

      {menu ? (
        <View style={styles.scrim}>
          <View style={[styles.sheet, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
            <Text variant="headline" accessibilityRole="header">
              Leave this game?
            </Text>
            <Text color="sub">
              {space.mode === 'pool'
                ? `You forfeit your ${formatNaira(space.seatFeeKobo)} seat fee and finish last.`
                : 'You finish last. The others carry on.'}
            </Text>
            <TokenButton label="Leave game" onPress={onForfeit} />
            <TokenButton label="Stay and play" tone="chip" onPress={() => setMenu(false)} />
            {!noGL ? (
              <TokenButton
                label={flat ? 'Use the 3D table' : 'Use the flat table'}
                tone="chip"
                onPress={() => {
                  setFlatChoice(!flat);
                  setMenu(false);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The table without 3D: opponents, the card in play and the draw pile, then your cards as a list. */
function FlatTable({
  model,
  space,
  nameOf,
  line,
  listProps,
}: {
  model: TableModel;
  space: SpaceView;
  nameOf: (id: string) => string;
  line: string | null;
  listProps: Parameters<typeof CardList>[0];
}) {
  const force = inForceLine(model);
  return (
    <View style={styles.fill}>
      <View style={styles.flatOpponents}>
        {model.seats
          .filter((s) => s.index > 0)
          .map((s) => {
            const member = space.members.find((m) => m.userId === s.id);
            return (
              <View
                key={s.id}
                accessible
                accessibilityLabel={`${nameOf(s.id)}, ${s.count} ${s.count === 1 ? 'card' : 'cards'}${s.current ? ', their turn' : ''}${s.lastCard ? ', last card' : ''}`}
                style={[
                  styles.flatSeat,
                  { borderColor: s.current ? brand.brass.fill : GLASS_EDGE },
                ]}
              >
                <UserAvatar avatar={member?.avatar} name={s.name} size={32} />
                <Text variant="footnote" style={{ color: ON_TABLE }} numberOfLines={1}>
                  {s.name} · {s.count}
                </Text>
              </View>
            );
          })}
      </View>
      <View
        style={styles.flatCentre}
        accessible
        accessibilityLabel={`Card in play: ${model.top.label}. ${model.deckCount} cards left to draw.`}
      >
        <MiniCard face={model.top} width={64} />
        <View style={styles.fill}>
          <Text variant="callout" style={{ color: ON_TABLE }}>
            {model.top.label}
          </Text>
          {force ? (
            <Text variant="footnote" style={{ color: SOFT }}>
              {force}
            </Text>
          ) : null}
          {model.colorInForce ? (
            <Text variant="footnote" style={{ color: SOFT }}>
              {COLOR_NAME[model.colorInForce]} is the colour to match
            </Text>
          ) : null}
          <Text variant="footnote" style={{ color: SOFT }}>
            {model.deckCount} to draw{line ? ` · ${line}` : ''}
          </Text>
        </View>
      </View>
      <CardList {...listProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  banner: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  cue: {
    alignSelf: 'center',
    marginTop: 8,
    maxWidth: '90%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(227,169,59,0.96)',
  },
  cueText: { color: '#3A2400', textAlign: 'center' },
  bottom: { paddingBottom: 6 },
  ruleRow: { alignItems: 'center', paddingBottom: 8 },
  rule: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 17,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  statusPill: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cta: { minWidth: 120 },
  passLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  error: { color: '#FFB4A3', textAlign: 'center', paddingTop: 4 },
  centreLabel: { position: 'absolute', width: 220, marginLeft: -110, alignItems: 'center' },
  forceChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  pileLabel: {
    position: 'absolute',
    width: 120,
    marginLeft: -60,
    textAlign: 'center',
    color: SOFT,
    letterSpacing: 0.6,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  flatOpponents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  flatSeat: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: GLASS,
  },
  flatCentre: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
