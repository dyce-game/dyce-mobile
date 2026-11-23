import { joinNames, type NameOf } from './common-logic';
import type { CharadesView } from './views';

/**
 * Charades, from the player's own view: teams and scores, what the actor can do, the rules for naming
 * who guessed, and the tilt detector for "phone on the forehead" play. Rules: backend ADR-023.
 */

export const isActor = (view: CharadesView, myId: string): boolean => view.actor === myId;

export const teamOf = (view: CharadesView, id: string): number =>
  view.teams.findIndex((t) => t.includes(id));

/** "Team 2 (Ada, Bayo)" for teams, the person's own name when everyone plays alone. */
export function teamLabel(view: CharadesView, index: number, nameOf: NameOf): string {
  const members = view.teams[index] ?? [];
  if (view.solo) return nameOf(members[0]);
  return `Team ${index + 1} (${joinNames(members.map((m) => nameOf(m)))})`;
}

export type ScoreRow = {
  index: number;
  label: string;
  score: number;
  /** Your team (or you, when playing alone). */
  mine: boolean;
  /** The team whose turn it is. */
  acting: boolean;
};

export function scoreRows(view: CharadesView, myId: string, nameOf: NameOf): ScoreRow[] {
  const mineIdx = teamOf(view, myId);
  return view.teams.map((_, i) => ({
    index: i,
    label: teamLabel(view, i, nameOf),
    score: view.scores[i] ?? 0,
    mine: i === mineIdx,
    acting: view.phase !== 'over' && view.actorTeam === i,
  }));
}

/** The people the actor can credit with a guess: in a solo game every other player (required). */
export function guesserChoices(view: CharadesView, myId: string): string[] {
  return view.players.filter((p) => p !== myId);
}

/**
 * Whether "Got it" must name who guessed. Alone, in act mode: yes (they score too). In teams: optional, and
 * we do not ask. Heads-up: the engine refuses a name, so never.
 */
export const needsGuesser = (view: CharadesView): boolean => view.mode === 'act' && view.solo;

export type Stage = {
  headline: string;
  sub: string;
  /** What the actor can do now. Everyone else has no button. */
  action: 'start' | 'card' | null;
};

export function charadesStage(view: CharadesView, myId: string, nameOf: NameOf): Stage {
  const actor = isActor(view, myId);
  const turn = `Turn ${Math.min(view.turn + 1, view.turns)} of ${view.turns}`;
  switch (view.phase) {
    case 'ready':
      return actor
        ? {
            headline: 'You are up',
            sub:
              view.mode === 'headsup'
                ? 'Put the phone on your forehead, then start.'
                : 'Start when you are ready. No talking.',
            action: 'start',
          }
        : { headline: `${nameOf(view.actor)} is up next`, sub: turn, action: null };
    case 'acting':
      return actor
        ? {
            headline: view.mode === 'headsup' ? 'Guess from their clues' : 'Act it out',
            sub: `Card ${view.cardNo ?? 1} of ${view.cardsPerTurn}`,
            action: 'card',
          }
        : {
            headline: `${nameOf(view.actor)} ${view.mode === 'headsup' ? 'has the card on their forehead' : 'is acting'}`,
            sub:
              view.mode === 'headsup' ? 'Give clues out loud or in chat.' : 'Shout your guesses.',
            action: null,
          };
    case 'over':
      return { headline: 'That is the game', sub: '', action: null };
  }
}

/** The line about the card that was just resolved ("Ada got it: Danfo driver"), for the ticker. */
export function lastEventLine(view: CharadesView, nameOf: NameOf, myId: string): string | null {
  const e = view.last;
  if (!e) return null;
  const who = nameOf(e.by);
  switch (e.kind) {
    case 'got_it': {
      const by = e.guesser ? ` (${nameOf(e.guesser)} guessed it)` : '';
      // The word on the card is only sent to people allowed to see it; the event carries it for all.
      return `${who} got it${e.text ? `: ${e.text}` : ''}${by}`;
    }
    case 'skip':
      return `${who} skipped${e.text ? `: ${e.text}` : ''}`;
    case 'time_up':
      return `Time is up for ${e.by === myId ? 'you' : who}`;
    case 'forfeit':
      return `${who} was not ready, turn passed`;
    case 'start':
      return null;
  }
}

/** Winner line at the end: the teams in front, or a draw. */
export function winnerText(view: CharadesView, nameOf: NameOf): string {
  const best = Math.max(0, ...view.scores);
  const leaders = view.scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s === best)
    .map((x) => x.i);
  if (leaders.length === view.scores.length) return 'It is a draw.';
  return `${joinNames(leaders.map((i) => teamLabel(view, i, nameOf)))} ${
    leaders.length === 1 ? 'wins' : 'tie in front'
  }.`;
}

// ---- tilt ("phone on the forehead") -----------------------------------------------------------------

/**
 * Tilt as the app reads it: +1 when the screen faces the floor (the player nodded down: "got it"), -1 when
 * it faces the ceiling (tilted back: "skip"), about 0 when held upright against the forehead.
 * It is the accelerometer's z axis in g (flat, screen up, reads -1 on iOS; the "flip" switch exists because
 * Android and some devices differ). Never the only way to answer: the buttons always work.
 */
export type TiltState = { smooth: number; armed: boolean; lastAt: number };
export type TiltEvent = 'got_it' | 'skip' | null;

export const TILT_TRIGGER = 0.6;
export const TILT_REARM = 0.3;
export const TILT_COOLDOWN_MS = 900;

export const newTilt = (): TiltState => ({ smooth: 0, armed: false, lastAt: -Infinity });

/**
 * One accelerometer reading. A reading only counts after the phone has been upright (re-armed), so a start
 * with the phone already tilted does not fire, and one tilt fires one answer.
 */
export function stepTilt(
  prev: TiltState,
  z: number,
  now: number,
  flip = false,
): { state: TiltState; event: TiltEvent } {
  const raw = Math.max(-1.5, Math.min(1.5, flip ? -z : z));
  const smooth = prev.smooth * 0.4 + raw * 0.6;
  let armed = prev.armed;
  let lastAt = prev.lastAt;
  let event: TiltEvent = null;
  if (Math.abs(smooth) <= TILT_REARM) armed = true;
  else if (armed && now - lastAt >= TILT_COOLDOWN_MS) {
    if (smooth >= TILT_TRIGGER) event = 'got_it';
    else if (smooth <= -TILT_TRIGGER) event = 'skip';
    if (event) {
      armed = false;
      lastAt = now;
    }
  }
  return { state: { smooth, armed, lastAt }, event };
}
