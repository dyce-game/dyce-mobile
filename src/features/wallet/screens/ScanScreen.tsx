import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextField, TokenButton, useTheme } from '@dyce/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { parseRequestCode } from '../wallet-logic';

/**
 * Pay a code: paste a Dyce link or type the code someone read out. Only `dyce.games/r/<code>` links and
 * bare codes are accepted; anything else is "That's not a Dyce code." The Pay screen then fetches the real
 * details from the server. Camera scanning (expo-camera) is a separate step on top of this same parser.
 */
export function ScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  function go() {
    const code = parseRequestCode(text);
    if (!code) {
      setError("That's not a Dyce code.");
      return;
    }
    router.replace(`/wallet/pay/${code}` as Href);
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Pay a code" fallback="/wallet" />
        <Text color="sub">
          Paste the link someone sent you, or type their 10-character code. You&apos;ll see who is
          asking and how much before anything is paid.
        </Text>
        <TextField
          label="Link or code"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(undefined);
          }}
          placeholder="https://dyce.games/r/…"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={go}
          error={error}
        />
        <TokenButton label="Continue" disabled={!text.trim()} onPress={go} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14 },
});
