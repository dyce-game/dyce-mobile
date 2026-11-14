import { View } from 'react-native';
import { Screen, Text } from '@dyce/ui';
import { TabHeader } from '@/features/shell/TabHeader';

export default function ChatTab() {
  return (
    <Screen scroll bottomInset={120}>
      <TabHeader title="Chat" onPlus={() => undefined} />
      <View style={{ gap: 6, paddingTop: 24 }}>
        <Text variant="headline">No chats yet</Text>
        <Text color="sub">Messaging arrives in Phase 1. This is the Phase 0 shell.</Text>
      </View>
    </Screen>
  );
}
