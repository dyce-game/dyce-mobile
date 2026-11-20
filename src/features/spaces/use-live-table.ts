import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Client } from 'colyseus.js';
import type { LiveError, LiveState } from '@dyce/shared';
import { ApiError } from '@/features/auth/api-client';
import { getFreshAccessToken, spacesApi } from '@/lib/api';
import { LiveConnection, type LiveStatus, type RoomLike } from './live-connection';

/** The Android emulator reaches the host machine at 10.0.2.2, not localhost. */
export function resolveWsUrl(raw: string): string {
  if (Platform.OS === 'android') {
    return raw.replace('://localhost', '://10.0.2.2').replace('://127.0.0.1', '://10.0.2.2');
  }
  return raw;
}

/** Asks the API where the table is (it makes sure the room exists), then joins it with a fresh token. */
async function openRoom(spaceId: string): Promise<RoomLike> {
  const conn = await spacesApi.connect(spaceId);
  const token = await getFreshAccessToken();
  if (!token) throw new ApiError(401, 'unauthorized');
  const client = new Client(resolveWsUrl(conn.url));
  return (await client.joinById(conn.roomId, { token })) as unknown as RoomLike;
}

export type LiveTable = {
  /** The latest table the server sent (kept while reconnecting), or null before the first one. */
  state: LiveState | null;
  status: LiveStatus;
  /** The last refusal from the server, cleared by the next state. */
  error: LiveError | null;
  /** Local time when `state` arrived, for the turn clock. */
  receivedAt: number;
  /** Sends a move for the version you are looking at. False if there is no line right now. */
  move: (action: unknown) => boolean;
  /** Leaves the game for good: your seat forfeits. */
  forfeit: () => void;
  /** Take the seat back after another device took it over. */
  takeOver: () => void;
};

/** Keeps the live line to a space's table open while the screen is up. */
export function useLiveTable(spaceId: string, enabled: boolean): LiveTable {
  const [state, setState] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [error, setError] = useState<LiveError | null>(null);
  const received = useRef(Date.now());
  const conn = useRef<LiveConnection | null>(null);
  const version = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    const live = new LiveConnection({
      open: () => openRoom(spaceId),
      onState: (s) => {
        // Never go back to an older table; the same version still updates who is connected.
        if (s.version < version.current) return;
        version.current = s.version;
        received.current = Date.now();
        setError(null);
        setState(s);
      },
      onError: setError,
      onStatus: setStatus,
    });
    conn.current = live;
    live.start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') live.reconnectNow();
    });
    return () => {
      sub.remove();
      live.stop();
      conn.current = null;
    };
  }, [spaceId, enabled]);

  const move = useCallback(
    (action: unknown) => {
      if (!state) return false;
      return conn.current?.send('move', { expectedVersion: state.version, action }) ?? false;
    },
    [state],
  );
  const forfeit = useCallback(() => void conn.current?.send('leave'), []);
  const takeOver = useCallback(() => conn.current?.reconnectNow(true), []);

  return { state, status, error, receivedAt: received.current, move, forfeit, takeOver };
}
