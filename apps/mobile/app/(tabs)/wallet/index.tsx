import { View } from 'react-native';
import { WELCOME_GRANT_KOBO, formatNaira } from '@dyce/shared';
import { Screen, Text, WalletPill } from '@dyce/ui';
import { TabHeader } from '@/features/shell/TabHeader';

export default function WalletTab() {
  return (
    <Screen scroll bottomInset={120}>
      <TabHeader title="Wallet" right={<WalletPill balance={WELCOME_GRANT_KOBO} />} />
      <View style={{ gap: 6, paddingTop: 24 }}>
        <Text variant="title">{formatNaira(WELCOME_GRANT_KOBO)}</Text>
        <Text color="sub">Dyce Cash is virtual. It can&apos;t be bought or withdrawn.</Text>
      </View>
    </Screen>
  );
}
