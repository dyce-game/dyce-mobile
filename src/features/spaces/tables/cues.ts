import { COLOR_NAME, SHAPE_PLURAL } from './faces';
import type { TableEvent, TableModel } from './model';

/**
 * What to make a fuss about after a move: a Skip, a Reverse, a Draw Two, a chosen colour or shape, a seat
 * on its last card. The words are ours ("Last card!", "Crazy card"). The 3D table pulses the seat the cue
 * is about; the banner and the screen reader read the text. Pure and tested.
 */

export type CueKind =
  | 'skip'
  | 'reverse'
  | 'draw'
  | 'wild'
  | 'ask'
  | 'hold_on'
  | 'market'
  | 'last_card'
  | 'missed_call'
  | 'pass';

export type Cue = {
  kind: CueKind;
  text: string;
  /** The seat it is about (the one that misses a turn, draws, calls), if any. */
  seat: string | null;
  /** 1 = loudest. The banner shows the lowest number. */
  rank: number;
};

type Names = (id: string) => string;

/** The seat that plays after `by`, going the way the table goes after that move. */
export function nextAfter(
  m: TableModel,
  by: string,
  direction: 1 | -1 = m.direction,
): string | null {
  const ids = m.seats.map((s) => s.id);
  const i = ids.indexOf(by);
  if (i < 0 || ids.length < 2) return null;
  // Seats are stored in turn order (me first), so "after" is the next index when going clockwise.
  const j = (((i + direction) % ids.length) + ids.length) % ids.length;
  return ids[j] ?? null;
}

const who = (id: string, nameOf: Names, me: string | undefined): string =>
  id === me ? 'You' : nameOf(id);
const verb = (id: string, me: string | undefined, you: string, they: string): string =>
  id === me ? you : they;

/** Cues for the move that took the table from `prev` to `next` (none if no new move). */
export function cuesFor(prev: TableModel | null, next: TableModel, nameOf: Names): Cue[] {
  const e = next.event;
  const out: Cue[] = [];
  const me = next.seats[0]?.id;
  if (e && prev && e.seq !== (prev.event?.seq ?? -1)) out.push(...eventCues(e, next, nameOf, me));
  // A seat that just went down to its last card.
  if (prev) {
    for (const s of next.seats) {
      const before = prev.seats.find((x) => x.id === s.id);
      if (s.lastCard && before && !before.lastCard) {
        out.push({
          kind: 'last_card',
          text: s.id === me ? 'Last card!' : `${s.name} is on their last card!`,
          seat: s.id,
          rank: 2,
        });
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function eventCues(e: TableEvent, m: TableModel, nameOf: Names, me: string | undefined): Cue[] {
  const out: Cue[] = [];
  const by = e.by;
  const name = (id: string) => who(id, nameOf, me);
  if (e.kind === 'pass') {
    out.push({
      kind: 'pass',
      text: `${name(by)} ${verb(by, me, 'pass', 'passes')}`,
      seat: by,
      rank: 9,
    });
  }
  if (e.missedCall) {
    out.push({
      kind: 'missed_call',
      text: `${name(by)} forgot to call last card: ${verb(by, me, 'pick', 'picks')} 2`,
      seat: by,
      rank: 3,
    });
  }
  switch (e.effect) {
    case 'skip':
    case 'suspension': {
      // The seat after the player misses out.
      const victim = nextAfter(m, by, m.direction);
      if (victim) {
        out.push({
          kind: 'skip',
          text: `${e.effect === 'skip' ? 'Skip' : 'Suspension'}! ${name(victim)} ${verb(victim, me, 'miss', 'misses')} a turn`,
          seat: victim,
          rank: 1,
        });
      }
      break;
    }
    case 'reverse':
      out.push({ kind: 'reverse', text: 'Reverse! Play goes the other way', seat: by, rank: 1 });
      break;
    case 'draw_two':
    case 'draw_four': {
      const n = e.victimDrew || (e.effect === 'draw_two' ? 2 : 4);
      const victim = e.victim ?? nextAfter(m, by, m.direction);
      if (victim) {
        out.push({
          kind: 'draw',
          text: `${e.effect === 'draw_two' ? 'Draw Two' : 'Draw Four'}! ${name(victim)} ${verb(victim, me, 'pick', 'picks')} ${n} and ${verb(victim, me, 'miss', 'misses')} a turn`,
          seat: victim,
          rank: 1,
        });
      }
      break;
    }
    case 'wild':
      if (e.color) {
        out.push({
          kind: 'wild',
          text: `${name(by)} chose ${COLOR_NAME[e.color].toLowerCase()}`,
          seat: by,
          rank: 2,
        });
      }
      break;
    case 'whot':
      if (e.requested) {
        out.push({
          kind: 'ask',
          text: `${name(by)} asked for ${SHAPE_PLURAL[e.requested]}`,
          seat: by,
          rank: 2,
        });
      }
      break;
    case 'hold_on':
      out.push({
        kind: 'hold_on',
        text: `Hold on! ${name(by)} ${verb(by, me, 'play', 'plays')} again`,
        seat: by,
        rank: 1,
      });
      break;
    case 'pick_two':
    case 'pick_three': {
      const victim = m.seats.find((s) => s.current)?.id ?? null;
      const n = e.effect === 'pick_two' ? 2 : 3;
      if (victim) {
        out.push({
          kind: 'draw',
          text: `Pick ${n === 2 ? 'two' : 'three'}! ${name(victim)} ${verb(victim, me, 'play', 'plays')} a ${n} or ${verb(victim, me, 'go', 'goes')} to market`,
          seat: victim,
          rank: 1,
        });
      }
      break;
    }
    case 'general_market':
      out.push({
        kind: 'market',
        text: 'General market! Everyone else picks a card',
        seat: null,
        rank: 1,
      });
      break;
    default:
      break;
  }
  return out;
}

/** The one line to show now: the loudest cue. */
export const headline = (cues: readonly Cue[]): Cue | null => cues[0] ?? null;
