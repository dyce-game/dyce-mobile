import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { formatNaira, type LiveResultRow, type SpaceView } from '@dyce/shared';
import { Icon, ModeBadge, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { WhotCardFace } from '../components/WhotCardFace';
import { CRAZY_PALETTE, dropPts, heartPts, leafPts, sunPts, type Pt } from './card-art';
import { COLOR_MARK, COLOR_NAME, SHAPE_PLURAL, type Face } from './faces';
import { endLine, type HandCard, type TableModel, type TableSeat } from './model';
import { whotShapePolys } from './card-art';

/** The table is a fixed dark room in both themes (the design's PlayCards and its Dark file are the same). */
export const ON_TABLE = '#FFFFFF';
export const SOFT = 'rgba(255,255,255,0.78)';
export const GLASS = 'rgba(0,0,0,0.45)';
export const GLASS_EDGE = 'rgba(255,255,255,0.14)';

const MARKS: Record<string, () => Pt[]> = {
  heart: heartPts,
  sun: sunPts,
  leaf: leafPts,
  drop: dropPts,
};

/** A Crazy Cards colour's mark as a small picture. */
export function MarkGlyph({
  color,
  size,
  tint,
}: {
  color: keyof typeof CRAZY_PALETTE;
  size: number;
  tint?: string;
}) {
  const pts = MARKS[COLOR_MARK[color]]!();
  return (
    <Svg width={size} height={size} viewBox="-0.55 -0.55 1.1 1.1" aria-hidden>
      <Polygon
        points={pts.map(([x, y]) => `${x},${-y}`).join(' ')}
        fill={tint ?? CRAZY_PALETTE[color][1]}
      />
    </Svg>
  );
}

const RANK_SHORT: Record<string, string> = {
  skip: 'S',
  reverse: 'R',
  draw_two: '+2',
  wild: 'C',
  draw_four: '+4',
};

/** A small Crazy Cards card for lists (number or letter, colour and the colour's mark). */
function CrazyMini({
  face,
  width,
}: {
  face: Extract<Face, { game: 'crazy-cards' }>;
  width: number;
}) {
  const col = face.suit === 'wild' ? null : CRAZY_PALETTE[face.suit];
  const dark = face.suit === 'yellow';
  const ink = dark ? '#4A3000' : '#FFFFFF';
  return (
    <View
      style={[
        styles.mini,
        {
          width,
          height: Math.round(width * 1.5),
          borderRadius: width * 0.13,
          backgroundColor: col ? col[1] : '#1E1815',
        },
      ]}
    >
      <Text
        style={{
          color: ink,
          fontFamily: 'BricolageGrotesque_800ExtraBold',
          fontSize: width * 0.42,
        }}
      >
        {RANK_SHORT[face.rank] ?? face.rank}
      </Text>
      {col ? (
        <MarkGlyph color={face.suit as keyof typeof CRAZY_PALETTE} size={width * 0.34} tint={ink} />
      ) : (
        <View style={styles.wheelRow}>
          {(['red', 'blue', 'green', 'yellow'] as const).map((c) => (
            <View
              key={c}
              style={{
                width: width * 0.15,
                height: width * 0.15,
                backgroundColor: CRAZY_PALETTE[c][1],
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** A card of either game, small. */
export function MiniCard({ face, width = 40 }: { face: Face; width?: number }) {
  return face.game === 'whot' ? (
    <WhotCardFace card={face.raw} width={width} />
  ) : (
    <CrazyMini face={face} width={width} />
  );
}

/** A Whot shape as a small picture (for the shape picker and the table's centre label). */
export function ShapeMark({ shape, size, color }: { shape: string; size: number; color: string }) {
  const polys = whotShapePolys(shape, 0, 0, 1, color, 1);
  return (
    <Svg width={size} height={size} viewBox="-0.55 -0.55 1.1 1.1" aria-hidden>
      {polys.map((p, i) => (
        <Polygon key={i} points={p.pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill={color} />
      ))}
    </Svg>
  );
}

// ---- header -----------------------------------------------------------------------------------------

export function TableHeader({
  space,
  onBack,
  onList,
  listOn,
  showList,
  onMenu,
}: {
  space: SpaceView;
  onBack: () => void;
  onList: () => void;
  listOn: boolean;
  showList: boolean;
  onMenu: () => void;
}) {
  return (
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
        <Text variant="footnote" style={{ color: ON_TABLE }} numberOfLines={1}>
          {space.mode === 'pool' ? `Pot ${formatNaira(space.potKobo)}` : space.name}
        </Text>
      </View>
      <View style={styles.headerRight}>
        {showList ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listOn ? 'Hide the card list' : 'Show your cards as a list'}
            accessibilityState={{ expanded: listOn }}
            onPress={onList}
            style={[styles.pill, listOn ? styles.pillOn : null]}
          >
            <Text variant="callout" style={{ color: listOn ? '#1B140F' : ON_TABLE }}>
              Cards
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Game menu"
          onPress={onMenu}
          style={styles.glassBtn}
        >
          <Icon name="menu" size={20} color={ON_TABLE} />
        </Pressable>
      </View>
    </View>
  );
}

// ---- a seat -----------------------------------------------------------------------------------------

export function SeatChip({
  seat,
  member,
  left,
  top,
  width,
  game,
}: {
  seat: TableSeat;
  member: SpaceView['members'][number] | undefined;
  left: number;
  top: number;
  width: number;
  game: TableModel['game'];
}) {
  const note = seat.forfeited
    ? 'Left'
    : !seat.connected
      ? 'Offline'
      : seat.lastCard
        ? 'Last card!'
        : null;
  return (
    <View
      accessible
      accessibilityLabel={`${seat.name}, ${seat.count} ${seat.count === 1 ? 'card' : 'cards'}${seat.current ? ', their turn' : ''}${
        seat.lastCard ? ', last card' : ''
      }${seat.forfeited ? ', left the game' : !seat.connected ? ', offline' : ''}`}
      style={[
        styles.seat,
        {
          left: `${left}%`,
          top: `${top}%`,
          width,
          marginLeft: -width / 2,
          opacity: seat.forfeited ? 0.45 : 1,
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.avatarRing,
          { borderColor: seat.current ? brand.brass.fill : 'rgba(255,255,255,0.55)' },
        ]}
      >
        <UserAvatar avatar={member?.avatar} name={seat.name} size={40} />
        <View
          style={[styles.count, seat.count === 1 ? { backgroundColor: brand.ember.fill } : null]}
        >
          <Text
            style={{
              color: seat.count === 1 ? '#fff' : '#1B140F',
              fontFamily: 'Figtree_800ExtraBold',
              fontSize: 12,
            }}
          >
            {seat.count}
          </Text>
        </View>
      </View>
      <Text numberOfLines={1} variant="footnote" style={styles.seatName}>
        {seat.name}
      </Text>
      {note ? (
        <Text
          variant="caption"
          style={{ color: seat.lastCard && !seat.forfeited ? brand.brass.fill : '#FFC857' }}
        >
          {note}
        </Text>
      ) : (
        <Text variant="caption" style={{ color: 'transparent' }}>
          {game === 'whot' ? ' ' : ' '}
        </Text>
      )}
    </View>
  );
}

// ---- the picker for a wild ---------------------------------------------------------------------------

export function Chooser({
  kind,
  initial,
  onPick,
  onCancel,
}: {
  kind: 'color' | 'shape';
  initial: string | null;
  onPick: (choice: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const options =
    kind === 'color'
      ? (['red', 'yellow', 'green', 'blue'] as const)
      : (['circle', 'triangle', 'cross', 'square', 'star'] as const);
  return (
    <View style={styles.scrim}>
      <View style={[styles.sheet, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
        <Text variant="headline" accessibilityRole="header">
          {kind === 'color' ? 'Pick a colour' : 'Which shape do you ask for?'}
        </Text>
        <View style={styles.options}>
          {options.map((o) => (
            <Pressable
              key={o}
              accessibilityRole="button"
              accessibilityLabel={
                kind === 'color'
                  ? `${COLOR_NAME[o as keyof typeof COLOR_NAME]}`
                  : `Ask for ${SHAPE_PLURAL[o as keyof typeof SHAPE_PLURAL]}`
              }
              accessibilityState={{ selected: o === initial }}
              onPress={() => onPick(o)}
              style={[
                styles.option,
                kind === 'color'
                  ? { backgroundColor: CRAZY_PALETTE[o as keyof typeof CRAZY_PALETTE][1] }
                  : { backgroundColor: '#F7EEDB' },
                o === initial
                  ? { borderColor: colors.text, borderWidth: 3 }
                  : { borderColor: 'transparent', borderWidth: 3 },
              ]}
            >
              {kind === 'color' ? (
                <>
                  <MarkGlyph
                    color={o as keyof typeof CRAZY_PALETTE}
                    size={26}
                    tint={o === 'yellow' ? '#4A3000' : '#FFFFFF'}
                  />
                  <Text
                    variant="footnote"
                    style={{ color: o === 'yellow' ? '#4A3000' : '#FFFFFF' }}
                  >
                    {COLOR_NAME[o as keyof typeof COLOR_NAME]}
                  </Text>
                </>
              ) : (
                <ShapeMark shape={o} size={30} color="#6A1424" />
              )}
            </Pressable>
          ))}
        </View>
        <TokenButton label="Cancel" tone="chip" onPress={onCancel} />
      </View>
    </View>
  );
}

// ---- your cards as a list: the way in for screen readers and anyone who prefers it -------------------

export function CardList({
  hand,
  myTurn,
  drawLabel,
  canDraw,
  canPass,
  pickedIndex,
  onPlay,
  onDraw,
  onPass,
  sheet,
  onClose,
}: {
  hand: HandCard[];
  myTurn: boolean;
  drawLabel: string;
  canDraw: boolean;
  canPass: boolean;
  pickedIndex: number;
  onPlay: (index: number) => void;
  onDraw: () => void;
  onPass: () => void;
  sheet: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const playable = hand.filter((h) => h.playable).length;
  const body = (
    <View
      style={[sheet ? styles.sheet : styles.listBody, { backgroundColor: colors.bg }]}
      accessibilityViewIsModal={sheet}
    >
      <View style={styles.listHead}>
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            Your cards
          </Text>
          <Text variant="footnote" color="sub">
            {myTurn
              ? playable > 0
                ? `${playable} you can play`
                : canPass
                  ? 'Nothing else to play: pass'
                  : 'Nothing to play: take a card'
              : 'Waiting for your turn'}
          </Text>
        </View>
        {sheet ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the list"
            onPress={onClose}
            style={styles.close}
          >
            <Text variant="callout">Done</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        style={sheet ? styles.listScroll : styles.flex}
        contentContainerStyle={styles.rows}
      >
        {hand.map(({ face, playable: ok }, i) => (
          <View
            key={`${face.key}-${i}`}
            style={[
              styles.row,
              {
                backgroundColor: colors.card,
                borderColor: i === pickedIndex ? colors.accent : colors.line,
              },
            ]}
          >
            <MiniCard face={face} width={34} />
            <View style={styles.flex}>
              <Text variant="callout" numberOfLines={2}>
                {face.label}
              </Text>
              <Text variant="footnote" color="sub">
                {ok ? 'You can play this' : myTurn ? "Can't play this now" : ' '}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${face.label}`}
              accessibilityState={{ disabled: !ok }}
              disabled={!ok}
              onPress={() => onPlay(i)}
              style={[styles.playBtn, { backgroundColor: ok ? brand.ember.fill : colors.chip }]}
            >
              <Text variant="callout" style={{ color: ok ? '#fff' : colors.sub }}>
                Play
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <View style={styles.listActions}>
        {canPass ? (
          <TokenButton label="Pass" tone="chip" onPress={onPass} style={styles.flex} />
        ) : null}
        <TokenButton
          label={drawLabel}
          tone={canPass ? 'chip' : 'ember'}
          disabled={!canDraw}
          onPress={onDraw}
          style={styles.flex}
        />
      </View>
    </View>
  );
  return sheet ? <View style={styles.scrim}>{body}</View> : body;
}

// ---- the end ----------------------------------------------------------------------------------------

export function ResultsPanel({
  model,
  space,
  results,
  myId,
  onContinue,
}: {
  model: TableModel;
  space: SpaceView;
  results: LiveResultRow[] | null;
  myId: string;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const winner = model.seats.find((s) => s.id === model.winnerId);
  const placed = [...model.seats]
    .map((s) => ({ s, row: results?.find((r) => r.userId === s.id) ?? null }))
    .sort(
      (a, b) =>
        (a.row?.placement ?? 99) - (b.row?.placement ?? 99) ||
        (a.s.points ?? 999) - (b.s.points ?? 999),
    );
  const title = !winner
    ? 'Nobody could move'
    : winner.id === myId
      ? 'You win!'
      : `${winner.name} wins`;
  const pool = space.mode === 'pool';
  return (
    <View style={styles.scrim}>
      <View style={[styles.sheet, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
        <Text variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
          {title}
        </Text>
        {model.endReason === 'blocked' ? (
          <Text color="sub">Nobody could move, so the fewest points win.</Text>
        ) : null}
        <View style={styles.rows}>
          {placed.map(({ s, row }, i) => {
            const place = row?.placement ?? i + 1;
            const pay = row?.payoutKobo ?? null;
            return (
              <View
                key={s.id}
                accessible
                accessibilityLabel={`${place}${ordinalTail(place)}, ${s.id === myId ? 'You' : s.name}, ${endLine(s, model)}${pay !== null && pool ? `, ${pay > 0 ? `won ${formatNaira(pay)}` : 'no prize'}` : ''}`}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor: s.id === myId ? colors.accent : colors.line,
                  },
                ]}
              >
                <Text variant="headline" style={styles.place}>
                  {place}
                </Text>
                <View style={styles.flex}>
                  <Text variant="callout">{s.id === myId ? 'You' : s.name}</Text>
                  <Text variant="footnote" color="sub">
                    {endLine(s, model)}
                  </Text>
                </View>
                {s.revealed && s.revealed.length > 0 ? (
                  <View
                    style={styles.revealed}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {s.revealed.slice(0, 4).map((f, j) => (
                      <View key={`${f.key}-${j}`} style={j > 0 ? styles.overlap : null}>
                        <MiniCard face={f} width={22} />
                      </View>
                    ))}
                  </View>
                ) : null}
                {pool ? (
                  <Text
                    variant="callout"
                    style={{ color: pay && pay > 0 ? colors.money : colors.sub }}
                  >
                    {pay === null ? '' : pay > 0 ? `+${formatNaira(pay)}` : '—'}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <TokenButton label="See results" onPress={onContinue} />
      </View>
    </View>
  );
}

const ordinalTail = (n: number): string =>
  n % 10 === 1 && n !== 11
    ? 'st'
    : n % 10 === 2 && n !== 12
      ? 'nd'
      : n % 10 === 3 && n !== 13
        ? 'rd'
        : 'th';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mini: { alignItems: 'center', justifyContent: 'center', gap: 1, overflow: 'hidden' },
  wheelRow: { flexDirection: 'row', flexWrap: 'wrap', width: 22, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  pill: {
    minWidth: 64,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillOn: { backgroundColor: brand.brass.fill },
  modeRow: { alignItems: 'center', gap: 2, maxWidth: '38%' },
  seat: {
    position: 'absolute',
    width: 96,
    marginLeft: -48,
    marginTop: -30,
    alignItems: 'center',
    gap: 2,
  },
  avatarRing: { borderRadius: 26, borderWidth: 3 },
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
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  option: {
    minWidth: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 2,
  },
  listBody: { flex: 1, padding: 16, gap: 10 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listScroll: { maxHeight: 360 },
  rows: { gap: 8 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 16,
    borderWidth: 2,
  },
  playBtn: {
    minWidth: 64,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  close: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  listActions: { flexDirection: 'row', gap: 10 },
  place: { width: 28, textAlign: 'center' },
  revealed: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: -12 },
});
