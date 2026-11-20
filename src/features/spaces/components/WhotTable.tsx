import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNaira, type LiveState, type SpaceView } from '@dyce/shared';
import type { WhotCard, WhotShape } from '@dyce/games';
import { Icon, ModeBadge, Text, TokenButton, brand } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import type { LiveStatus } from '../live-connection';
import {
  SHAPES,
  SHAPE_PLURAL,
  cardLabel,
  drawAction,
  isWhotCard,
  lastEventLine,
  marketLabel,
  onLastCard,
  opponentSlots,
  opponentsOf,
  parseWhotView,
  playAction,
  playableCards,
  ruleLine,
  sameCard,
  secondsLeft,
  sortedHand,
} from '../whot-logic';
import { ShapeGlyph, WhotCardFace, WHOT_INK, WHOT_PAPER } from './WhotCardFace';

/** The table is the same wood in both themes (design: PlayWhot). */
const SPACE_BG = '#120A06';
const TABLE = '#6B3E22';
const TABLE_LIGHT = '#8A532E';
const ON_TABLE = '#FFFFFF';

export type WhotTableProps = {
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
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The Whot table (design: PlayWhot): opponents across the top, the market and the card in play in the
 * middle, your hand fanned along the bottom and one big button. A clean 2D table for this slice; the 3D
 * table comes with the 3D work. Tap a card to pick it, then "Play card" (a Whot also asks which shape);
 * "Go to market" picks up a card (or the whole penalty). The server checks every move: this only shows
 * what you can do and sends what you chose.
 */
export function WhotTable({
  space,
  myId,
  live,
  status,
  receivedAt,
  errorCode,
  onMove,
  onForfeit,
  onBack,
}: WhotTableProps) {
  const view = useMemo(() => parseWhotView(live.view), [live.view]);
  const [picked, setPicked] = useState<WhotCard | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const now = useNow(500);
  const { width: screenWidth } = useWindowDimensions();

  // Every new table, or a refusal, unlocks the buttons again.
  useEffect(() => setSending(false), [live.version, errorCode]);
  const myTurn = live.status === 'live' && live.turnUserId === myId;
  useEffect(() => {
    if (!myTurn) setPicked(null);
  }, [myTurn, live.version]);

  const nameOf = (id: string): string => {
    if (id === myId) return 'You';
    const m = space.members.find((x) => x.userId === id);
    return m?.displayName || m?.username || 'Player';
  };

  if (!view) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={{ color: ON_TABLE }}>The table couldn&apos;t be read. Try again.</Text>
      </View>
    );
  }

  const me = live.seats.find((s) => s.userId === myId);
  const playable = playableCards(view, myTurn && !sending && !me?.forfeited);
  const hand = sortedHand(view.hand);
  const cardW = handCardWidth(hand.length, screenWidth);
  const canMove = myTurn && !sending && status === 'live' && !me?.forfeited;
  const left = secondsLeft(live, receivedAt, now);
  const opponents = opponentsOf(view.players, myId);
  const slots = opponentSlots(opponents.length);
  const lastLine = lastEventLine(view.last, nameOf);
  const lastCardNames = onLastCard(view).map(nameOf);

  const send = (action: unknown) => {
    if (onMove(action)) setSending(true);
  };
  const play = (card: WhotCard, shape?: WhotShape) => {
    setPicked(null);
    send(playAction(view, card, shape));
  };

  const needsShape = picked !== null && isWhotCard(picked);
  const statusText = (() => {
    if (me?.forfeited) return 'You left this game';
    if (live.status === 'finished') return 'Game over';
    if (!myTurn) return `${nameOf(live.turnUserId ?? '')} is playing`;
    if (picked) return needsShape ? 'Which shape?' : `Play ${cardLabel(picked)}?`;
    if (view.pending) return `Pick ${view.pending.total} or play a ${view.pending.n}`;
    return playable.length > 0
      ? `Your turn · ${playable.length} playable`
      : 'Your turn · go to market';
  })();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the space"
            onPress={onBack}
            style={styles.glassBtn}
          >
            <Icon name="back" size={20} color={ON_TABLE} />
          </Pressable>
          <View style={styles.modeRow}>
            <ModeBadge kind={space.mode === 'pool' ? 'POOL' : 'FREE'} />
            <Text variant="footnote" style={{ color: ON_TABLE }}>
              {space.mode === 'pool' ? `Pot ${formatNaira(space.potKobo)}` : space.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Game menu"
            onPress={() => setConfirmLeave(true)}
            style={styles.glassBtn}
          >
            <Icon name="menu" size={20} color={ON_TABLE} />
          </Pressable>
        </View>

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

        <View style={styles.opponents}>
          {opponents.map((id, i) => {
            const slot = slots[i] ?? slots[0]!;
            const seat = live.seats.find((s) => s.userId === id);
            const member = space.members.find((m) => m.userId === id);
            const current = live.turnUserId === id;
            const count = view.counts[id] ?? 0;
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={`${nameOf(id)}, ${count} ${count === 1 ? 'card' : 'cards'}${
                  current ? ', their turn' : ''
                }${seat?.forfeited ? ', left the game' : !seat?.connected ? ', offline' : ''}`}
                style={[
                  styles.seat,
                  {
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    opacity: seat?.forfeited ? 0.45 : 1,
                  },
                ]}
              >
                <View style={styles.backs}>
                  {[-14, 0, 14].map((a) => (
                    <View
                      key={a}
                      style={[styles.miniBack, { transform: [{ rotate: `${a}deg` }] }]}
                    />
                  ))}
                </View>
                <View
                  style={[
                    styles.avatarRing,
                    { borderColor: current ? brand.brass.fill : 'rgba(255,255,255,0.55)' },
                  ]}
                >
                  <UserAvatar avatar={member?.avatar} name={nameOf(id)} size={40} />
                  <View
                    style={[
                      styles.count,
                      count === 1 ? { backgroundColor: brand.ember.fill } : null,
                    ]}
                  >
                    <Text
                      style={{
                        color: count === 1 ? '#fff' : '#1B140F',
                        fontFamily: 'Figtree_800ExtraBold',
                        fontSize: 12,
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={1} variant="footnote" style={styles.seatName}>
                  {nameOf(id)}
                </Text>
                {seat?.forfeited || !seat?.connected ? (
                  <Text variant="caption" style={styles.seatNote}>
                    {seat?.forfeited ? 'Left' : 'Offline'}
                  </Text>
                ) : lastCardNames.includes(nameOf(id)) ? (
                  <Text variant="caption" style={[styles.seatNote, { color: brand.brass.fill }]}>
                    Last card!
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={[styles.felt]}>
          <View style={styles.piles}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${marketLabel(view)}, ${view.marketCount} cards left in the market`}
              accessibilityState={{ disabled: !canMove }}
              disabled={!canMove}
              onPress={() => send(drawAction())}
              style={styles.pile}
            >
              <WhotCardFace faceDown width={74} />
              <Text variant="footnote" style={styles.pileLabel}>
                MARKET · {view.marketCount}
              </Text>
            </Pressable>
            <View style={styles.pile}>
              <WhotCardFace card={view.top} width={86} />
              <Text variant="footnote" style={styles.pileLabel}>
                IN PLAY
              </Text>
              {view.requested ? (
                <View
                  accessible
                  accessibilityLabel={`Asked for ${SHAPE_PLURAL[view.requested]}`}
                  style={styles.asked}
                >
                  <ShapeGlyph shape={view.requested} size={16} color={WHOT_INK} />
                  <Text variant="caption" style={{ color: WHOT_INK }}>
                    ASKED
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {lastLine ? (
            <Text variant="footnote" style={styles.lastLine} numberOfLines={2}>
              {lastLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.rule}>
          <Text variant="footnote" style={{ color: ON_TABLE }} numberOfLines={2}>
            {ruleLine(view)}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.handScroll}
          contentContainerStyle={styles.hand}
        >
          {hand.map((card, i) => {
            const ok = playable.some((p) => sameCard(p, card));
            const on = picked !== null && sameCard(picked, card);
            return (
              <Pressable
                key={`${card.shape}-${card.n}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${cardLabel(card)}${ok ? ', playable' : ''}`}
                accessibilityState={{ selected: on, disabled: !ok }}
                disabled={!ok}
                onPress={() => setPicked(on ? null : card)}
                style={[
                  styles.handCard,
                  {
                    marginLeft: i === 0 ? 0 : -Math.round(cardW * 0.26),
                    transform: [{ translateY: on ? -26 : ok && myTurn ? -8 : 0 }],
                  },
                  on ? styles.handCardOn : null,
                ]}
              >
                <WhotCardFace card={card} width={cardW} />
                {myTurn && !ok ? (
                  <View
                    pointerEvents="none"
                    style={[styles.dimmed, { borderRadius: cardW * 0.12 }]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {needsShape ? (
          <View style={styles.shapeRow} accessibilityLabel="Pick the shape to ask for">
            {SHAPES.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Ask for ${SHAPE_PLURAL[s]}`}
                onPress={() => play(picked!, s)}
                style={styles.shapeBtn}
              >
                <ShapeGlyph shape={s} size={26} color={WHOT_INK} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.statusPill} accessibilityLiveRegion="polite">
            <View
              style={[styles.dot, { backgroundColor: myTurn ? brand.brass.fill : '#8C8279' }]}
            />
            <View style={styles.flex}>
              <Text variant="callout" style={{ color: ON_TABLE }} numberOfLines={1}>
                {statusText}
              </Text>
              {live.status === 'live' && left !== null ? (
                <Text variant="footnote" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {left}s left
                </Text>
              ) : null}
            </View>
          </View>
          {live.status === 'live' ? (
            picked && !needsShape ? (
              <TokenButton
                label="Play card"
                disabled={!canMove}
                onPress={() => play(picked)}
                style={styles.cta}
              />
            ) : !picked ? (
              <TokenButton
                label={marketLabel(view)}
                tone="chip"
                disabled={!canMove}
                onPress={() => send(drawAction())}
                style={styles.cta}
              />
            ) : null
          ) : null}
        </View>
        {errorCode && errorCode !== 'stale_version' ? (
          <Text variant="footnote" style={styles.error} accessibilityRole="alert">
            {errorText(errorCode)}
          </Text>
        ) : null}
      </SafeAreaView>

      {confirmLeave ? (
        <View style={styles.scrim}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text variant="headline" style={{ color: '#1B140F' }}>
              Leave this game?
            </Text>
            <Text style={{ color: '#6F655B' }}>
              {space.mode === 'pool'
                ? `You forfeit your ${formatNaira(space.seatFeeKobo)} seat fee and finish last.`
                : 'You finish last. The others carry on.'}
            </Text>
            <TokenButton label="Leave game" onPress={onForfeit} />
            <TokenButton label="Stay and play" tone="chip" onPress={() => setConfirmLeave(false)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * How wide to draw each card in the hand so the whole hand fits the screen: full size for a normal hand,
 * smaller as it grows (never below a tappable size; then it scrolls). Cards overlap by about a quarter.
 */
export function handCardWidth(count: number, screenWidth: number): number {
  const room = Math.max(200, screenWidth - 44);
  const fit = room / (count - 0.26 * Math.max(0, count - 1));
  return Math.max(44, Math.min(70, Math.floor(fit)));
}

function errorText(code: string): string {
  const base = code.split(':')[0];
  switch (base) {
    case 'not_your_turn':
      return "It isn't your turn.";
    case 'illegal_move':
      return "That card can't be played now.";
    case 'forfeited':
      return 'You left this game.';
    case 'not_running':
      return 'This game is over.';
    default:
      return "That didn't work. Try again.";
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: SPACE_BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  modeRow: { alignItems: 'center', gap: 2 },
  banner: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  opponents: { height: 168, marginTop: 14 },
  seat: { position: 'absolute', width: 96, marginLeft: -48, alignItems: 'center', gap: 2 },
  backs: { height: 36, width: 70, alignItems: 'center' },
  miniBack: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#6A1424',
    borderWidth: 2,
    borderColor: '#F3E6CC',
  },
  avatarRing: { borderRadius: 26, borderWidth: 3, marginTop: -10 },
  count: {
    position: 'absolute',
    right: -10,
    bottom: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatName: { color: ON_TABLE, fontFamily: 'Figtree_800ExtraBold' },
  seatNote: { color: '#FFC857' },
  felt: {
    flex: 1,
    minHeight: 150,
    marginHorizontal: 22,
    borderRadius: 28,
    backgroundColor: TABLE,
    borderWidth: 3,
    borderColor: TABLE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  piles: { flexDirection: 'row', gap: 26, alignItems: 'center' },
  pile: { alignItems: 'center', gap: 4, minHeight: 44 },
  pileLabel: { color: 'rgba(255,255,255,0.8)', letterSpacing: 0.6 },
  asked: {
    position: 'absolute',
    right: -14,
    top: -10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 26,
    borderRadius: 13,
    backgroundColor: WHOT_PAPER,
  },
  lastLine: { color: '#FFF3DC', textAlign: 'center', paddingHorizontal: 14 },
  rule: {
    alignSelf: 'center',
    marginTop: 8,
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  handScroll: { flexGrow: 0, marginTop: 6 },
  hand: {
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 8,
    minWidth: '100%',
    justifyContent: 'center',
  },
  handCard: { borderRadius: 9 },
  dimmed: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,12,8,0.42)',
  },
  handCardOn: {
    shadowColor: '#E3A93B',
    shadowOpacity: 0.95,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  shapeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 6 },
  shapeBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: WHOT_PAPER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  statusPill: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cta: { minWidth: 130 },
  error: { color: '#FFB4A3', textAlign: 'center', paddingBottom: 4 },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FBF8F3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 12,
  },
});
