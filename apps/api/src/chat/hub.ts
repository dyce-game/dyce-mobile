import type { RealtimeEvent } from '@dyce/shared';
import type { Publisher } from './messages.service.ts';

/** The small part of a WebSocket the hub needs (so tests can use a fake). */
export type HubSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

/** Most live connections one user may hold (phone, tablet, a couple of browser tabs). */
export const MAX_SOCKETS_PER_USER = 5;

/**
 * Who is connected right now, and delivery of events to them. One process only: running several API
 * instances needs a shared bus (Redis pub/sub) behind `publish` (see ADR-010).
 */
export class RealtimeHub implements Publisher {
  private readonly sockets = new Map<string, Set<HubSocket>>();

  add(userId: string, socket: HubSocket): void {
    let set = this.sockets.get(userId);
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socket);
    // Over the limit: drop the oldest connection rather than refuse the newest.
    while (set.size > MAX_SOCKETS_PER_USER) {
      const oldest = set.values().next().value as HubSocket;
      set.delete(oldest);
      try {
        oldest.close(4002, 'too_many_connections');
      } catch {
        // already closing
      }
    }
  }

  remove(userId: string, socket: HubSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  publish(userIds: readonly string[], event: RealtimeEvent): void {
    const data = JSON.stringify(event);
    for (const id of new Set(userIds)) {
      for (const socket of this.sockets.get(id) ?? []) {
        try {
          socket.send(data);
        } catch {
          // a dying socket: the close handler removes it
        }
      }
    }
  }

  closeAll(code = 1001, reason = 'server_shutdown'): void {
    for (const set of this.sockets.values()) {
      for (const s of set) {
        try {
          s.close(code, reason);
        } catch {
          // ignore
        }
      }
    }
    this.sockets.clear();
  }
}
