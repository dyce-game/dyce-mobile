import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, TokenButton } from '@dyce/ui';

const SCOPES = ['chat', 'spaces', 'wallet'] as const;

// Modal scoped by ?scope=chat|spaces|wallet. Real search lands with the social-discovery work.
export default function SearchModal() {
  const router = useRouter();
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const safe = SCOPES.find((s) => s === scope) ?? 'chat';
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Search {safe}
      </Text>
      <Text color="sub">Search is scoped to the tab you came from.</Text>
      <TokenButton label="Close" tone="chip" onPress={() => router.back()} />
    </Screen>
  );
}
