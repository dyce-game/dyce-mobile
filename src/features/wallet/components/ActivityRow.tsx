import { Pressable, StyleSheet, View } from 'react-native';
import { formatNaira, type HistoryItem } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { clockTime } from '@/features/chat/chat-logic';
import { historyTile, historyTitle } from '../wallet-logic';

/**
 * One line of activity (design: Wallet and WalletHistory): a coloured tile, what it was, a quiet second line,
 * and the signed amount (green for money in). `size` is the Wallet tab (40 / 60) or History (38 / 58) variant.
 */
export function ActivityRow({
  item,
  meta,
  onPress,
  size = 'tab',
}: {
  item: HistoryItem;
  /** The second line ("suya · 7:50 AM"). Defaults to the note and the time. */
  meta?: string;
  onPress: () => void;
  size?: 'tab' | 'history';
}) {
  const { colors } = useTheme();
  const tile = historyTile(item);
  const title = historyTitle(item);
  const incoming = item.amountKobo > 0;
  const amount = formatNaira(Math.abs(item.amountKobo), { compact: true });
  const line = meta ?? [item.note, clockTime(item.createdAt)].filter(Boolean).join(' · ');
  const big = size === 'tab';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${incoming ? 'received' : 'sent'} ${formatNaira(Math.abs(item.amountKobo))}, ${line}`}
      onPress={onPress}
      style={[styles.row, { minHeight: big ? 60 : 58, borderColor: colors.line }]}
    >
      <View
        style={[styles.tile, big ? styles.tileBig : styles.tileSmall, { backgroundColor: tile.bg }]}
        aria-hidden
      >
        <Text style={[styles.mark, { fontSize: big ? 13 : 12 }]}>{tile.mark}</Text>
      </View>
      <View style={styles.body}>
        <Text variant="callout" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text variant="footnote" color="sub" numberOfLines={1} style={styles.meta}>
          {line}
        </Text>
      </View>
      <Text variant="callout" color={incoming ? 'money' : 'text'}>
        {incoming ? '+' : '−'}
        {amount}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  tileBig: { width: 40, height: 40, borderRadius: 12 },
  tileSmall: { width: 38, height: 38, borderRadius: 11 },
  mark: { color: '#FFFFFF', fontFamily: 'Figtree_800ExtraBold' },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Figtree_600SemiBold' },
  meta: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
});
