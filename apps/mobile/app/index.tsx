import { Redirect } from 'expo-router';

// Phase 1 replaces this with an auth gate: signed-out users go to (auth)/welcome.
export default function Index() {
  return <Redirect href="/chat" />;
}
