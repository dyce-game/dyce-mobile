import type { RealtimeEvent } from '@dyce/shared';

export type RealtimeStatus = 'idle' | 'connecting' | 'ready' | 'waiting';

/** The part of the standard WebSocket we use, so tests can supply a fake. */
export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

export type RealtimeDeps = {
  url: string;
  /** A token that is good right now (refreshing if needed), or null when signed out. */
  getToken: () => Promise<string | null>;
  onEvent: (event: RealtimeEvent) => void;
  onStatus?: (status: RealtimeStatus) => void;
  createSocket?: (url: string) => SocketLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  random?: () => number;
};

const OPEN = 1;
const MAX_DELAY_MS = 30_000;

/** Backoff for the nth failed attempt: 0.5s, 1s, 2s... capped at 30s, with jitter so a crowd doesn't reconnect in lockstep. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_DELAY_MS, 500 * 2 ** attempt);
  return Math.round(base * (0.5 + random() * 0.5));
}

const isEvent = (v: unknown): v is RealtimeEvent =>
  !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string';

/**
 * The live connection to the server. It authenticates with the first frame, reconnects by itself (with
 * backoff) when the connection drops, and reconnects at once when the server closes it because the token
 * expired. Nothing here is required for chat to work: messages are stored and fetched over HTTP; this
 * only makes them arrive instantly.
 */
export function createRealtimeClient(deps: RealtimeDeps) {
  const createSocket = deps.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const random = deps.random ?? Math.random;

  let socket: SocketLike | null = null;
  let status: RealtimeStatus = 'idle';
  let stopped = true;
  let attempts = 0;
  let retryTimer: unknown = null;
  let generation = 0; // ignores callbacks from a socket we've already given up on

  const setStatus = (next: RealtimeStatus) => {
    if (status === next) return;
    status = next;
    deps.onStatus?.(next);
  };

  const schedule = (delay: number) => {
    if (stopped || retryTimer) return;
    setStatus('waiting');
    retryTimer = setTimer(() => {
      retryTimer = null;
      void connect();
    }, delay);
  };

  async function connect(): Promise<void> {
    if (stopped || socket) return;
    const mine = ++generation;
    setStatus('connecting');
    let token: string | null;
    try {
      token = await deps.getToken();
    } catch {
      token = null;
    }
    if (stopped || mine !== generation) return;
    if (!token) {
      // signed out, or offline with nothing to show: try again later
      schedule(backoffMs(attempts++, random));
      return;
    }

    const ws = createSocket(deps.url);
    socket = ws;
    ws.onopen = () => {
      if (mine === generation) ws.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = (e) => {
      if (mine !== generation || typeof e.data !== 'string') return;
      let frame: unknown;
      try {
        frame = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!isEvent(frame)) return;
      if (frame.type === 'ready') {
        attempts = 0;
        setStatus('ready');
      }
      deps.onEvent(frame);
    };
    ws.onerror = () => {
      // the close handler that follows does the work
    };
    ws.onclose = (e) => {
      if (mine !== generation) return;
      socket = null;
      if (stopped) return;
      // 4403: our token expired (expected every so often): reconnect now with a fresh one.
      schedule(e.code === 4403 ? 0 : backoffMs(attempts++, random));
    };
  }

  return {
    get status() {
      return status;
    },
    start() {
      if (!stopped) return;
      stopped = false;
      attempts = 0;
      void connect();
    },
    stop() {
      stopped = true;
      generation++;
      if (retryTimer) clearTimer(retryTimer);
      retryTimer = null;
      const ws = socket;
      socket = null;
      try {
        ws?.close(1000, 'client_stop');
      } catch {
        // already closed
      }
      setStatus('idle');
    },
    /** The app came back to the foreground (or the network returned): don't wait out the backoff. */
    reconnectNow() {
      if (stopped || status === 'ready' || status === 'connecting') return;
      if (retryTimer) {
        clearTimer(retryTimer);
        retryTimer = null;
      }
      attempts = 0;
      void connect();
    },
    /** Best effort: dropped silently if the socket isn't ready. */
    sendTyping(conversationId: string, typing: boolean) {
      if (status !== 'ready' || !socket || socket.readyState !== OPEN) return;
      try {
        socket.send(JSON.stringify({ type: 'typing', conversationId, typing }));
      } catch {
        // ignore
      }
    },
  };
}

export type RealtimeClient = ReturnType<typeof createRealtimeClient>;

/** http(s) API base URL to the matching ws(s) endpoint. */
export function realtimeUrl(apiUrl: string): string {
  return `${apiUrl.replace(/^http/i, 'ws').replace(/\/$/, '')}/realtime`;
}
