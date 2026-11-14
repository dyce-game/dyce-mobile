import { View } from 'react-native';
import { Screen, Text } from '@dyce/ui';
import { TabHeader } from '@/features/shell/TabHeader';

export default function SpacesTab() {
  return (
    <Screen scroll bottomInset={120}>
      <TabHeader title="Spaces" onPlus={() => undefined} />
      <View style={{ gap: 6, paddingTop: 24 }}>
        <Text variant="headline">No Spaces yet</Text>
        <Text color="sub">Multiplayer Spaces arrive in Phase 2.</Text>
      </View>
    </Screen>
  );
}
