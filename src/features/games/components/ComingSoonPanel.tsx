import { StyleSheet, View } from 'react-native';
import { Text, TokenButton } from '@dyce/ui';
import { RulesSheet } from './RulesSheet';

/**
 * What the host shows for a game that has a catalogue entry but no board in this build. In a dev build it says
 * so and shows the rules; in a production build it is the usual "update the app" screen (the server only
 * offers a game once its board has shipped, so this is an old app meeting a new game).
 */
export function ComingSoonPanel({ slug, onBack }: { slug: string; onBack: () => void }) {
  return (
    <View style={styles.root}>
      {__DEV__ ? (
        <>
          <Text variant="headline" style={styles.text}>
            Coming soon
          </Text>
          <Text color="sub" style={styles.text}>
            This game has rules and an engine, but its board is not built yet (dev builds only).
          </Text>
          <RulesSheet slug={slug} />
        </>
      ) : (
        <Text variant="headline" style={styles.text}>
          Update Dyce to play this game
        </Text>
      )}
      <TokenButton label="Back to chat" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  text: { textAlign: 'center' },
});
