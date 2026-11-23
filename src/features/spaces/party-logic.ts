import { crazyCanPlay, liveGame, type CrazyCard, type CrazyColor } from '@dyce/games';
import type { LiveChat, LiveState } from '@dyce/shared';

/**
 * Pure logic for the live tables other than Whot! (Crazy Cards, Imposter, Werewolf, Charades, Doodle
 * Guess): what kind of room it is, the countdown, table talk, and the quick actions the debug table offers.
 * The room's protocol is in dyce-backend/docs/PARTY_ROOM_PROTOCOL.md. No React in here, so it is tested.
 */

export type RoomKind = 'turns' | 'party';

export const roomKindOf = (slug: string): RoomKind | null => liveGame(slug)?.kind ?? null;

/** Games with a real table screen. Every other live game is shown by the generic table until its own exists. */
export const hasOwnTable = (slug: string): boolean => slug === 'whot';

/** Seconds until the room moves on (the turn, or the end of the phase), from the server's clock. */
export function secondsLeft(state: LiveState, receivedAt: number, now: number): number | null {
  if (state.turnDeadlineAt === null || state.status !== 'live') return null;
  // The device clock may be off: count from the server's own "now" at send time.
  const serverNow = state.serverNow + (now - receivedAt);
  return Math.max(0, Math.ceil((state.turnDeadlineAt - serverNow) / 1000));
}

/** Adds lines to the table talk: no repeats, in order, only the latest `max`. */
export function mergeChat(prev: LiveChat[], incoming: LiveChat[], max = 80): LiveChat[] {
  const seen = new Set(prev.map((c) => c.id));
  const next = [...prev];
  for (const c of incoming) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    next.push(c);
  }
  next.sort((a, b) => a.id - b.id);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The phase the engine says it is in ("night", "draw", "vote", ...), when it has one. */
export function phaseOf(view: unknown): string | null {
  const p = (view as { phase?: unknown } | null)?.phase;
  return typeof p === 'string' ? p : null;
}

export type DebugAction = { label: string; action: unknown };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v !== null && typeof v === 'object' ? (v as Obj) : {});
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * One-tap actions for the debug table, from the player's own view: just enough to play a round without
 * the real screens. Anything else goes through the raw action box.
 */
export function debugActions(slug: string, view: unknown, myId: string): DebugAction[] {
  const v = asObj(view);
  const phase = phaseOf(view);
  const out: DebugAction[] = [];
  switch (slug) {
    case 'imposter': {
      if (phase === 'reveal') out.push({ label: 'Ready', action: { kind: 'ready' } });
      if (phase === 'clue' && v.speaker === myId)
        out.push({ label: 'Clue: "hmm"', action: { kind: 'clue', text: 'hmm' } });
      if (phase === 'vote') {
        const n = typeof v.imposterCount === 'number' ? v.imposterCount : 1;
        const others = strings(v.players).filter((p) => p !== myId);
        out.push({
          label: `Vote for ${others.slice(0, n).length} other(s)`,
          action: { kind: 'vote', targets: others.slice(0, n) },
        });
      }
      if (phase === 'guess')
        out.push({ label: 'Guess', action: { kind: 'guess', text: 'banana' } });
      break;
    }
    case 'werewolf': {
      const alive = strings(v.alive);
      const others = alive.filter((p) => p !== myId);
      if (phase === 'night') {
        if (v.role === 'werewolf')
          out.push({ label: 'Kill someone', action: { kind: 'kill', target: others[0] } });
        if (v.role === 'seer')
          out.push({ label: 'Inspect someone', action: { kind: 'inspect', target: others[0] } });
        if (v.role === 'doctor')
          out.push({ label: 'Protect myself', action: { kind: 'protect', target: myId } });
      }
      if (phase === 'day') out.push({ label: 'Ready to vote', action: { kind: 'ready' } });
      if (phase === 'vote') {
        out.push({ label: 'Vote someone', action: { kind: 'vote', target: others[0] ?? null } });
        out.push({ label: 'Abstain', action: { kind: 'vote', target: null } });
      }
      break;
    }
    case 'charades': {
      if (v.actor !== myId) break;
      if (phase === 'ready') out.push({ label: 'Start my turn', action: { kind: 'start' } });
      if (phase === 'acting') {
        out.push({ label: 'Got it', action: { kind: 'got_it' } });
        out.push({ label: 'Skip', action: { kind: 'skip' } });
      }
      break;
    }
    case 'doodle-guess': {
      if (phase === 'choose' && v.drawer === myId) {
        strings(v.choices).forEach((w, i) =>
          out.push({ label: `Draw "${w}"`, action: { kind: 'choose', index: i } }),
        );
      }
      if (phase === 'draw' && v.drawer === myId) {
        out.push({
          label: 'Draw a line',
          action: {
            kind: 'stroke',
            points: [
              [100, 100],
              [500, 400],
              [900, 150],
            ],
            color: 1,
            width: 3,
          },
        });
        out.push({ label: 'Clear', action: { kind: 'clear' } });
      }
      if (phase === 'draw' && v.drawer !== myId)
        out.push({ label: 'Guess "cat"', action: { kind: 'guess', text: 'cat' } });
      break;
    }
    case 'crazy-cards': {
      if (v.current !== myId) break;
      const hand = (Array.isArray(v.hand) ? v.hand : []) as CrazyCard[];
      const top = v.top as CrazyCard | undefined;
      const color = v.color as CrazyColor | undefined;
      const drawn = (v.drawn ?? null) as CrazyCard | null;
      if (top && color) {
        const playable = (drawn ? [drawn] : hand).find((c) => crazyCanPlay(c, top, color));
        if (playable) {
          const play: Obj = { kind: 'play', card: playable };
          if (playable.color === 'wild')
            play.color = hand.find((c) => c.color !== 'wild')?.color ?? 'red';
          if (hand.length - 1 === 1) play.call = true;
          out.push({ label: `Play ${playable.color} ${playable.value}`, action: play });
        }
      }
      out.push(
        drawn
          ? { label: 'Pass', action: { kind: 'pass' } }
          : { label: 'Draw', action: { kind: 'draw' } },
      );
      break;
    }
    default:
      break;
  }
  return out;
}

/** The server's refusal code in a sentence a tester can read. */
export function refusalText(code: string | null): string | null {
  if (!code) return null;
  const [base, reason] = code.split(':');
  const text: Record<string, string> = {
    not_your_turn: "You can't act right now.",
    illegal_move: 'The game does not allow that.',
    invalid_action: 'That is not an action this game understands.',
    stale_version: 'The table moved on. Try again.',
    rate_limited: 'Slow down.',
    waiting: 'Waiting for everyone to join.',
    chat_closed: 'Nobody can hear you right now.',
    forfeited: 'You left this game.',
    not_running: 'The game is over.',
    server_error: 'Something went wrong on the server.',
  };
  const line = text[base ?? ''] ?? `Refused (${base}).`;
  return reason ? `${line} (${reason})` : line;
}
