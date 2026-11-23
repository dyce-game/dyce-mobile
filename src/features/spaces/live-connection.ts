import type { CanvasMessage } from '@dyce/games';
import { LIVE_CLOSE_REPLACED, type LiveChat, type LiveError, type LiveState } from '@dyce/shared';
import { backoffMs } from '../chat/realtime-client';

/**
 * The connection to a live table (the Colyseus game server). The table is the server's: this only keeps a
 * line open to it, hands every `state` it sends to the screen, sends moves, and gets the line back when it
 * drops, with a growing pause between tries and a fresh join each time (the server keeps the seat for 60 s).
 *
 * Written against a tiny `RoomLike` so the reconnect rules are unit tested without a network.
 */

export type LiveStatus =
  /** First connection in progress. */
  | 'connecting'
  | 'live'
  /** The line dropped; trying again. The table below stays as it was. */
  | 'reconnecting'
  /** The same account opened this table somewhere else. */
  | 'replaced'
  /** The table is over or gone: show the result instead. */
  | 'ended';

export type RoomLike = {
  onMessage(type: string, cb: (message: never) => void): unknown;
  onLeave(cb: (code: number) => void): unknown;
  send(type: string, message?: unknown): void;
  leave(consented?: boolean): Promise<unknown> | void;
};

export type LiveDeps = {
  /** Asks the API for the room and joins it. May throw: network, a refused token, a match that is over. */
  open: () => Promise<RoomLike>;
  onState: (state: LiveState) => void;
  onError: (error: LiveError) => void;
  /** Party games: a line of table talk, and the lines you missed while away (sent on every join). */
  onChat?: (chat: LiveChat) => void;
  onChatHistory?: (chats: LiveChat[]) => void;
  /** Doodle Guess: a piece of the drawing (apply in order with `applyCanvas`). */
  onCanvas?: (message: CanvasMessage) => void;
  onStatus: (status: LiveStatus) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  random?: () => number;
};

/** Whether a failed join means "this table is over" (stop trying) rather than "try again". */
export function tableIsGone(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  const status = (err as { status?: unknown } | null)?.status;
  // Colyseus: 4403 not seated, 4404 match not running. API: the space isn't live / isn't there.
  return (
    code === 4403 ||
    code === 4404 ||
    code === 'space_not_open' ||
    code === 'space_not_found' ||
    status === 404
  );
}

export class LiveConnection {
  private room: RoomLike | null = null;
  private stopped = false;
  private attempt = 0;
  private everLive = false;
  private finished = false;
  private timer: unknown = null;
  private status: LiveStatus = 'connecting';
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(private readonly deps: LiveDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  start(): void {
    this.stopped = false;
    this.deps.onStatus(this.status);
    void this.connect();
  }

  /** Closes the line for good (leaving the screen). The seat is not given up: it forfeits only after a minute. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const room = this.room;
    this.room = null;
    try {
      void room?.leave(true);
    } catch {
      // already closed
    }
  }

  /**
   * Comes back to the app: don't wait out the pause. A table another device took over only comes back
   * when the person asks for it (`force`), otherwise the two devices would keep pushing each other out.
   */
  reconnectNow(force = false): void {
    if (this.stopped || this.status === 'live') return;
    if (this.status === 'replaced' && !force) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    void this.connect();
  }

  send(type: string, message?: unknown): boolean {
    if (!this.room) return false;
    try {
      this.room.send(type, message);
      return true;
    } catch {
      return false;
    }
  }

  private set(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.deps.onStatus(status);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.set(this.everLive ? 'reconnecting' : 'connecting');
    let room: RoomLike;
    try {
      room = await this.deps.open();
    } catch (err) {
      if (this.stopped) return;
      if (tableIsGone(err)) {
        this.set('ended');
        return;
      }
      this.retry();
      return;
    }
    if (this.stopped) {
      try {
        void room.leave(true);
      } catch {
        // ignore
      }
      return;
    }
    this.room = room;
    this.attempt = 0;
    this.everLive = true;
    room.onMessage('state', ((s: LiveState) => {
      if (this.room !== room) return;
      if (s.status === 'finished') this.finished = true;
      this.deps.onState(s);
    }) as (m: never) => void);
    room.onMessage('error', ((e: LiveError) => {
      if (this.room === room) this.deps.onError(e);
    }) as (m: never) => void);
    room.onMessage('chat', ((c: LiveChat) => {
      if (this.room === room) this.deps.onChat?.(c);
    }) as (m: never) => void);
    room.onMessage('chat_history', ((h: LiveChat[]) => {
      if (this.room === room) this.deps.onChatHistory?.(h);
    }) as (m: never) => void);
    room.onMessage('canvas', ((m: CanvasMessage) => {
      if (this.room === room) this.deps.onCanvas?.(m);
    }) as (m: never) => void);
    room.onLeave((code) => {
      if (this.room !== room) return;
      this.room = null;
      if (this.stopped) return;
      if (code === LIVE_CLOSE_REPLACED) {
        this.set('replaced');
        return;
      }
      // The server closes a finished table a little after the result: that is the end, not a drop.
      if (this.finished) {
        this.set('ended');
        return;
      }
      this.retry();
    });
    this.set('live');
  }

  private retry(): void {
    if (this.stopped) return;
    this.set(this.everLive ? 'reconnecting' : 'connecting');
    const wait = backoffMs(this.attempt, this.deps.random);
    this.attempt += 1;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.connect();
    }, wait);
  }
}
