import type { LiveChat, LiveResultRow, LiveState, SpaceView } from '@dyce/shared';

/**
 * Pure helpers shared by the four party screens (Doodle Guess, Imposter, Werewolf, Charades): names,
 * the countdown ring, who may talk right now, and the result lines. No React, so it is tested.
 * Protocol: dyce-backend/docs/PARTY_ROOM_PROTOCOL.md.
 */

export type PartySlug = 'imposter' | 'werewolf' | 'charades' | 'doodle-guess';
export const PARTY_SLUGS: readonly PartySlug[] = [
  'imposter',
  'werewolf',
  'charades',
  'doodle-guess',
];
export const hasPartyScreen = (slug: string): slug is PartySlug =>
  (PARTY_SLUGS as readonly string[]).includes(slug);

/** How long a finished party table stays up (the reveal) before the app moves to the results by itself. */
export const PARTY_RESULT_DELAY_MS = 25_000;

/**
 * How long each phase lasts by default (backend: engine `init` defaults). Only used to size the ring around
 * the countdown; the real remaining time always comes from the server's clock, never from this.
 */
const PHASE_MS: Record<string, number> = {
  'imposter:reveal': 10_000,
  'imposter:clue': 20_000,
  'imposter:vote': 45_000,
  'imposter:guess': 20_000,
  'werewolf:night': 30_000,
  'werewolf:day': 60_000,
  'werewolf:vote': 30_000,
  'charades:ready': 20_000,
  'charades:acting': 60_000,
  'doodle-guess:choose': 10_000,
  'doodle-guess:draw': 80_000,
};

/** The length the ring is measured against: the default, or the time left if a table runs longer phases. */
export function phaseTotalMs(slug: string, phase: string | null, leftMs = 0): number {
  const base = PHASE_MS[`${slug}:${phase ?? ''}`] ?? 30_000;
  return Math.max(base, leftMs);
}

/** 0..1 of the ring still to go. */
export function ringFraction(secondsLeft: number | null, totalMs: number): number {
  if (secondsLeft === null || totalMs <= 0) return 0;
  return Math.max(0, Math.min(1, (secondsLeft * 1000) / totalMs));
}

/** "0:15", "1:05"; "–:––" when there is no clock (waiting for everyone to join). */
export function formatClock(seconds: number | null): string {
  if (seconds === null) return '–:––';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What a screen reader hears for the countdown. */
export function clockLabel(seconds: number | null): string {
  if (seconds === null) return 'No clock yet';
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`;
}

export type NameOf = (userId: string | null | undefined) => string;

/** "You" for the viewer, otherwise their display name (or username). */
export function nameResolver(space: Pick<SpaceView, 'members'>, myId: string): NameOf {
  return (userId) => {
    if (!userId) return 'Nobody';
    if (userId === myId) return 'You';
    const m = space.members.find((x) => x.userId === userId);
    return m?.displayName || m?.username || 'Player';
  };
}

/** Joins names the way people say it: "Ada", "Ada and Bayo", "Ada, Bayo and Zee". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

export type SeatNote = 'left' | 'offline' | null;

/** Whether a seat has left or is just offline (shown under the name, spoken in the label). */
export function seatNote(live: Pick<LiveState, 'seats'>, userId: string): SeatNote {
  const s = live.seats.find((x) => x.userId === userId);
  if (!s) return null;
  if (s.forfeited) return 'left';
  return s.connected ? null : 'offline';
}

export function iForfeited(live: Pick<LiveState, 'seats'>, myId: string): boolean {
  return live.seats.find((s) => s.userId === myId)?.forfeited === true;
}

// ---- table talk -------------------------------------------------------------------------------------

export type TalkState = {
  /** The input is shown and a line would be heard by somebody. */
  open: boolean;
  /** Why it is closed, or whom you are talking to when it is open. */
  note: string;
};

/**
 * Whether the table talk box is open for this seat right now. The room's rule is `chatAudienceFor`
 * (backend); this mirrors it so the box is not offered when a line would be refused. The server still
 * decides: a refusal comes back as `chat_closed`.
 */
export function talkState(
  slug: PartySlug,
  view: { phase: string } & Record<string, unknown>,
  myId: string,
  live: Pick<LiveState, 'status' | 'waiting'>,
): TalkState {
  if (live.status === 'finished') return { open: true, note: 'Everyone can hear you' };
  if (live.waiting) return { open: false, note: 'Chat opens when everyone has joined' };
  const phase = view.phase;
  switch (slug) {
    case 'imposter':
      return phase === 'vote'
        ? { open: true, note: 'Everyone can hear you' }
        : { open: false, note: 'Chat opens when voting starts' };
    case 'werewolf': {
      const dead = Array.isArray(view.dead) && (view.dead as string[]).includes(myId);
      if (dead) return { open: true, note: 'Only the fallen hear you' };
      if (phase === 'night') {
        return view.role === 'werewolf'
          ? { open: true, note: 'Only the werewolves hear you' }
          : { open: false, note: 'Night: only the werewolves talk' };
      }
      return { open: true, note: 'Everyone can hear you' };
    }
    case 'charades':
      return phase === 'acting' && view.actor === myId
        ? { open: false, note: 'You are acting: no talking' }
        : { open: true, note: 'Shout your guesses' };
    case 'doodle-guess':
      return { open: false, note: 'Type your guess below' };
  }
}

/** The last lines of table talk, oldest first. */
export function recentTalk(chats: readonly LiveChat[], n: number): LiveChat[] {
  return chats.length > n ? chats.slice(chats.length - n) : [...chats];
}

// ---- results ----------------------------------------------------------------------------------------

export type ResultLine = {
  userId: string;
  placement: number;
  result: LiveResultRow['result'];
  payoutKobo: number | null;
};

/** The server's results, best placement first (stable for ties). Empty until the match is settled. */
export function resultLines(results: LiveResultRow[] | null): ResultLine[] {
  if (!results) return [];
  return [...results]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.placement - b.r.placement || a.i - b.i)
    .map(({ r }) => ({
      userId: r.userId,
      placement: r.placement,
      result: r.result,
      payoutKobo: r.payoutKobo,
    }));
}

/** "1st", "2nd", "3rd", "4th" … */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** One short sentence for the viewer's own outcome ("You won", "You finished 3rd", "A draw: stakes returned"). */
export function myOutcomeLine(lines: readonly ResultLine[], myId: string): string | null {
  const mine = lines.find((l) => l.userId === myId);
  if (!mine) return null;
  if (mine.result === 'forfeit') return 'You left the game';
  if (mine.result === 'draw') return 'A draw';
  if (mine.result === 'win')
    return mine.placement === 1 ? 'You won' : `You finished ${ordinal(mine.placement)}`;
  return `You finished ${ordinal(mine.placement)}`;
}

/** Refusals worth saying out loud on a party screen; the harmless ones (a late tap) say nothing. */
export function partyRefusal(code: string | null): string | null {
  if (!code) return null;
  const [base, reason] = code.split(':');
  switch (base) {
    case 'not_your_turn':
    case 'stale_version':
      return null;
    case 'rate_limited':
      return 'Slow down a little.';
    case 'chat_closed':
      return 'Nobody can hear you right now.';
    case 'waiting':
      return 'Waiting for everyone to join.';
    case 'forfeited':
      return 'You left this game.';
    case 'not_running':
      return 'The game is over.';
    case 'illegal_move':
      return reasonText(reason);
    case 'invalid_action':
      return 'That did not go through.';
    default:
      return 'Something went wrong. Try again.';
  }
}

const REASON_TEXT: Record<string, string> = {
  not_allowed: 'That word is not allowed.',
  clue_too_long: 'A clue is one to three words.',
  empty_clue: 'Say something first.',
  wrong_phase: '',
  canvas_full: 'The canvas is full. Clear it to keep drawing.',
  invalid_guess: 'That guess is not valid.',
  already_guessed: 'You already guessed it.',
  drawer_cannot_guess: 'You are drawing.',
  already_acted: 'You already chose tonight.',
  already_voted: 'You already voted.',
  already_ready: 'You are already ready.',
  invalid_target: 'You cannot pick that player.',
  cannot_vote_self: 'You cannot vote for yourself.',
  wrong_target_count: 'Pick the right number of players.',
  guesser_required: 'Say who guessed it.',
};

function reasonText(reason: string | undefined): string | null {
  if (!reason) return 'The game does not allow that.';
  const t = REASON_TEXT[reason];
  if (t === '') return null;
  return t ?? 'The game does not allow that.';
}

// ---- seats around a table -----------------------------------------------------------------------------

export type Slot = { x: number; y: number };

/**
 * Where each player sits around an ellipse, as -1..1 offsets from its centre. You sit at the bottom
 * (nearest your thumbs) and the others follow clockwise in table order, so everyone sees the same ring from
 * their own seat. `players` is the table order; the result is in the same order.
 */
export function ringSlots(players: readonly string[], myId: string): Slot[] {
  const n = players.length;
  if (n === 0) return [];
  const me = Math.max(0, players.indexOf(myId));
  return players.map((_, i) => {
    const k = (i - me + n) % n;
    const angle = Math.PI / 2 + (k / n) * Math.PI * 2; // 90° is the bottom of the screen (y grows down)
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}
