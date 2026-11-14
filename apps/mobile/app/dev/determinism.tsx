import { useMemo } from 'react';
import { Redirect } from 'expo-router';
import { GOLDEN, computeDeterminismReport, computeRngVector } from '@dyce/games';
import { Screen, Text } from '@dyce/ui';

// Runs the SAME scenario that `pnpm test:determinism` runs in Node, but on this device's JS engine
// (Hermes on iOS/Android). Any mismatch means client prediction could disagree with the server.
export default function Determinism() {
  if (!__DEV__) return <Redirect href="/chat" />;

  const rows = useMemo(() => {
    const report = computeDeterminismReport();
    const out = Object.entries(report).map(([k, v]) => ({ k, ok: GOLDEN.report[k] === v, got: v }));
    const rng = computeRngVector(GOLDEN.rngSeed, GOLDEN.rngVector.length);
    out.push({
      k: 'rng vector',
      ok: JSON.stringify(rng) === JSON.stringify(GOLDEN.rngVector),
      got: rng.join(','),
    });
    return out;
  }, []);

  const allOk = rows.every((r) => r.ok);
  return (
    <Screen scroll>
      <Text variant="title" accessibilityRole="header">
        Determinism {allOk ? 'PASS' : 'FAIL'}
      </Text>
      {rows.map((r) => (
        <Text key={r.k} color={r.ok ? 'money' : 'accent'}>
          {r.ok ? 'PASS' : 'FAIL'} · {r.k}
        </Text>
      ))}
    </Screen>
  );
}
