import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, type SpaceView } from '@dyce/shared';
import { Text, TokenButton } from '@dyce/ui';
import { useSession } from '@/features/auth/use-session';
import { PartyDebugTable } from '../components/PartyDebugTable';
import { WhotTable } from '../components/WhotTable';
import { PartyTable } from '../party/PartyTable';
import { PARTY_RESULT_DELAY_MS, hasPartyScreen } from '../party/common-logic';
import { hasOwnTable } from '../party-logic';
import { CardTable } from '../tables/CardTable';
import { isCardGame } from '../tables/model';
import { LiveIssueOverlay } from '../components/LiveIssueOverlay';
import { useLiveTable, type LiveTable } from '../use-live-table';

/** A finished table stays up this long so everybody sees the last card before the result slides in. */
const RESULT_DELAY_MS = 2500;

/**
 * The live table for a running space: opens the line to the game server, shows the table (Whot! and the four party games have their own; the rest use the debug table until their screens exist) and moves
 * to the results when the game ends. The line comes back by itself if it drops, and the server keeps the
 * seat for a minute; a reconnecting banner shows meanwhile.
 */
export function TableScreen({ space }: { space: SpaceView }) {
  const myId = useSession((s) => s.userId);
  const table = useLiveTable(space.id, true);
  return (
    <View style={styles.fill}>
      <TableBody space={space} table={table} />
      <LiveIssueOverlay
        space={space}
        live={table.state}
        status={table.status}
        myId={myId}
        onRetry={table.retry}
      />
    </View>
  );
}

function TableBody({ space, table }: { space: SpaceView; table: LiveTable }) {
  const router = useRouter();
  const client = useQueryClient();
  const myId = useSession((s) => s.userId);
  const { state, status } = table;
  const finished = state?.status === 'finished';

  useEffect(() => {
    if (!finished) return;
    // The server has paid out in the same step; refresh what the app shows about it.
    void client.invalidateQueries({ queryKey: queryKeys.space(space.id) });
    void client.invalidateQueries({ queryKey: queryKeys.spaces('mine') });
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
    const id = setTimeout(
      () => router.replace(`/space/${space.id}/result` as Href),
      hasPartyScreen(space.gameSlug) || isCardGame(space.gameSlug)
        ? PARTY_RESULT_DELAY_MS
        : RESULT_DELAY_MS,
    );
    return () => clearTimeout(id);
  }, [finished, space.id, space.gameSlug, client, router]);

  // The table is gone (over, or never started): the space itself says what became of it.
  useEffect(() => {
    if (status === 'ended' && !state) {
      void client.invalidateQueries({ queryKey: queryKeys.space(space.id) });
    }
  }, [status, state, space.id, client]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/spaces' as Href));

  if (!state || !myId) {
    return (
      <View style={styles.wait}>
        {status === 'ended' ? (
          <>
            <Text variant="headline" style={styles.light}>
              This table has closed
            </Text>
            <TokenButton label="Back to spaces" tone="chip" onPress={back} />
          </>
        ) : (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.light} accessibilityLiveRegion="polite">
              {status === 'reconnecting' ? 'Reconnecting to the table…' : 'Taking your seat…'}
            </Text>
          </>
        )}
      </View>
    );
  }

  if (status === 'replaced') {
    return (
      <View style={styles.wait}>
        <Text variant="headline" style={styles.light}>
          This table is open on another device
        </Text>
        <Text style={styles.light}>Close it there, or open this space again to play here.</Text>
        <TokenButton label="Play here" onPress={table.takeOver} />
        <TokenButton label="Back" tone="chip" onPress={back} />
      </View>
    );
  }

  if (hasPartyScreen(space.gameSlug)) {
    return (
      <PartyTable
        space={space}
        myId={myId}
        live={state}
        status={status}
        receivedAt={table.receivedAt}
        errorCode={table.error?.code ?? null}
        chats={table.chats}
        canvas={table.canvas}
        onMove={table.move}
        onChat={table.chat}
        onForfeit={table.forfeit}
        onBack={back}
        onContinue={() => router.replace(`/space/${space.id}/result` as Href)}
      />
    );
  }

  // Whot! and Crazy Cards: the 3D card table (it falls back to the flat one when 3D is not available).
  if (isCardGame(space.gameSlug)) {
    return (
      <CardTable
        space={space}
        myId={myId}
        live={state}
        status={status}
        receivedAt={table.receivedAt}
        errorCode={table.error?.code ?? null}
        onMove={table.move}
        onForfeit={() => {
          table.forfeit();
        }}
        onBack={back}
        onContinue={() => router.replace(`/space/${space.id}/result` as Href)}
      />
    );
  }

  if (!hasOwnTable(space.gameSlug)) {
    return (
      <PartyDebugTable
        space={space}
        myId={myId}
        live={state}
        status={status}
        receivedAt={table.receivedAt}
        errorCode={table.error?.code ?? null}
        chats={table.chats}
        onMove={table.move}
        onChat={table.chat}
        onForfeit={table.forfeit}
        onBack={back}
      />
    );
  }

  return (
    <WhotTable
      space={space}
      myId={myId}
      live={state}
      status={status}
      receivedAt={table.receivedAt}
      errorCode={table.error?.code ?? null}
      onMove={table.move}
      onForfeit={() => {
        table.forfeit();
      }}
      onBack={back}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wait: {
    flex: 1,
    backgroundColor: '#120A06',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  light: { color: '#fff', textAlign: 'center' },
});
