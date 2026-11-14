import { Pressable, StyleSheet, View } from 'react-native';
import { formatNaira, type Kobo } from '@dyce/shared';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand, MIN_TOUCH } from '../tokens.ts';

/** Coin + compact balance. Amounts always come from `formatNaira` (₦200k, ₦1,500, ₦12.5k). */
export function WalletPill({ balance, onPress }: { balance: Kobo; onPress?: () => void }) {
  const { colors } = useTheme();
  const text = formatNaira(balance, { compact: true });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Wallet balance ${formatNaira(balance)}, virtual Dyce Cash`}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.chip }]}
    >
      <View
        style={[styles.coin, { backgroundColor: brand.brass.fill, borderColor: brand.brass.edge }]}
      />
      <Text variant="callout">{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: MIN_TOUCH,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coin: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
