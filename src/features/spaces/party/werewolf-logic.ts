import { joinNames, type NameOf } from './common-logic';
import type { WerewolfLog, WerewolfRole, WerewolfView } from './views';

/**
 * Werewolf, from the player's own view: roles, who is alive, your night action, the day and vote prompts
 * and the story so far. Rules: backend ADR-023. The dead see every role (the view says so); everyone else
 * only learns a role when a player falls.
 */

export const ROLE_INFO: Record<
  WerewolfRole,
  { label: string; blurb: string; night: string | null; color: string }
> = {
  villager: {
    label: 'Villager',
    blurb: 'No powers. Talk, watch and vote out the wolves.',
    night: null,
    color: '#6B7A8F',
  },
  werewolf: {
    label: 'Werewolf',
    blurb: 'Choose a victim each night. Do not get caught.',
    night: 'Choose a victim',
    color: '#C93E1C',
  },
  seer: {
    label: 'Seer',
    blurb: 'Learn if one player is a werewolf each night.',
    night: 'Who do you want to inspect?',
    color: '#7B5CD6',
  },
  doctor: {
    label: 'Doctor',
    blurb: 'Save one player each night.',
    night: 'Who do you want to protect?',
    color: '#1C7AC0',
  },
};

export const isAlive = (view: WerewolfView, id: string): boolean => view.alive.includes(id);

export function winnerLine(view: WerewolfView): string {
  switch (view.winner) {
    case 'villagers':
      return 'The village wins: every werewolf is gone.';
    case 'werewolves':
      return 'The werewolves win: the village has fallen.';
    case 'draw':
      return 'Nobody wins: ten nights passed. Every stake is returned.';
    default:
      return '';
  }
}

/** Did your side win (null while the game is on, and for a draw)? */
export function iWon(view: WerewolfView): boolean | null {
  if (view.winner === null || view.winner === 'draw' || !view.role) return null;
  const wolf = view.role === 'werewolf';
  return view.winner === 'werewolves' ? wolf : !wolf;
}

/** The role of a player, when you may know it (the dead, the end, your own, your pack). */
export function knownRole(view: WerewolfView, id: string): WerewolfRole | null {
  return view.roles?.[id] ?? view.revealed[id] ?? (view.wolves?.includes(id) ? 'werewolf' : null);
}

export type NightAction = {
  kind: 'kill' | 'inspect' | 'protect';
  /** The button label: "Choose victim" and so on. */
  verb: string;
  prompt: string;
  targets: string[];
  /** Your choice so far (wolves can change it until the night ends; the others lock in). */
  current: string | null;
  done: boolean;
};

/** Your night job, or null if you are a villager or out of the game. */
export function nightAction(view: WerewolfView, myId: string): NightAction | null {
  if (view.phase !== 'night' || !isAlive(view, myId)) return null;
  const alive = view.alive;
  switch (view.role) {
    case 'werewolf':
      return {
        kind: 'kill',
        verb: 'Choose victim',
        prompt: 'Choose a victim',
        targets: alive.filter(
          (p) => !view.wolves?.includes(p) && knownRole(view, p) !== 'werewolf',
        ),
        current: view.wolfTargets?.[myId] ?? null,
        done: view.acted === true,
      };
    case 'seer':
      return {
        kind: 'inspect',
        verb: 'Inspect',
        prompt: 'Who do you want to inspect?',
        targets: alive.filter((p) => p !== myId),
        current: view.inspecting ?? null,
        done: view.acted === true,
      };
    case 'doctor':
      return {
        kind: 'protect',
        verb: 'Protect',
        prompt: 'Who do you want to protect?',
        targets: [...alive],
        current: view.protecting ?? null,
        done: view.acted === true,
      };
    default:
      return null;
  }
}

/** Who the pack has named so far, for the wolves' own screen: target → the wolves who named them. */
export function packVotes(view: WerewolfView): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [wolf, target] of Object.entries(view.wolfTargets ?? {})) {
    out.set(target, [...(out.get(target) ?? []), wolf]);
  }
  return out;
}

export type Stage = {
  headline: string;
  sub: string;
  /** The main button: night job, "ready to vote" (day), the vote (vote) or nothing. */
  action: 'night' | 'ready' | 'vote' | null;
};

export function werewolfStage(view: WerewolfView, myId: string): Stage {
  const alive = isAlive(view, myId);
  switch (view.phase) {
    case 'night': {
      if (!alive) {
        return {
          headline: `Night ${view.night}`,
          sub: 'You are out. Watch quietly: you can see every role.',
          action: null,
        };
      }
      const job = nightAction(view, myId);
      if (!job) {
        return {
          headline: `Night ${view.night}`,
          sub: 'Close your eyes. The village sleeps.',
          action: null,
        };
      }
      if (job.done) {
        return {
          headline: `Night ${view.night}`,
          sub:
            job.kind === 'kill'
              ? 'Your pick is in. Waiting for the pack.'
              : 'Done. Waiting for the night to end.',
          action: job.kind === 'kill' ? 'night' : null,
        };
      }
      return { headline: `Night ${view.night}`, sub: job.prompt, action: 'night' };
    }
    case 'day': {
      const ready = view.ready.includes(myId);
      return {
        headline: `Day ${view.night}`,
        sub: alive
          ? ready
            ? `${view.ready.length} of ${view.alive.length} ready to vote`
            : 'Talk it through. Who is a werewolf?'
          : 'You are out. Listen in.',
        action: alive && !ready ? 'ready' : null,
      };
    }
    case 'vote': {
      if (!alive) return { headline: 'Vote', sub: 'The village is voting.', action: null };
      const voted = view.voted.includes(myId);
      return voted
        ? {
            headline: 'Vote cast',
            sub: `${view.voted.length} of ${view.alive.length} have voted`,
            action: null,
          }
        : { headline: 'Who goes?', sub: 'Pick a player to banish, or skip.', action: 'vote' };
    }
    case 'over':
      return { headline: 'Game over', sub: winnerLine(view), action: null };
  }
}

const roleName = (r: WerewolfRole): string => ROLE_INFO[r].label.toLowerCase();

/** "Ife was" / "You were": the verb follows the name. */
const wasOf = (nameOf: NameOf, id: string): string =>
  `${nameOf(id)} ${nameOf(id) === 'You' ? 'were' : 'was'}`;

const roleTail = (r: WerewolfRole | null): string => (r ? ` Role: ${roleName(r)}.` : '');

/** One line for each thing that happened, oldest first ("Night 1: Ife was killed. They were the seer."). */
export function logLines(log: readonly WerewolfLog[], nameOf: NameOf): string[] {
  return log.map((e) => {
    if (e.kind === 'night') {
      return e.killed
        ? `Night ${e.night}: ${wasOf(nameOf, e.killed)} killed.${roleTail(e.role)}`
        : `Night ${e.night}: nobody died.`;
    }
    return e.lynched
      ? `Day ${e.night}: ${wasOf(nameOf, e.lynched)} banished.${roleTail(e.role)}`
      : `Day ${e.night}: the vote was tied or skipped. Nobody was banished.`;
  });
}

/** What happened in the night that just ended, for the top of the day (null if nothing yet). */
export function lastNightLine(view: WerewolfView, nameOf: NameOf): string | null {
  if (view.phase !== 'day' && view.phase !== 'vote') return null;
  const entry = [...view.log].reverse().find((e) => e.kind === 'night');
  if (!entry || entry.kind !== 'night') return null;
  if (!entry.killed) return 'Nobody died in the night.';
  return `${wasOf(nameOf, entry.killed)} killed in the night${
    entry.role ? ` (${roleName(entry.role)})` : ''
  }.`;
}

/** Your seer findings so far, newest last. */
export function seerFindings(view: WerewolfView, nameOf: NameOf): string[] {
  return (view.seerLog ?? []).map(
    (f) =>
      `Night ${f.night}: ${nameOf(f.target)} ${f.werewolf ? 'is a werewolf' : 'is not a werewolf'}`,
  );
}

/** "2 werewolves, 1 seer, 1 doctor, 3 villagers" for the header. */
export function compositionLine(view: WerewolfView): string {
  const c = view.composition;
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(c.werewolf, 'werewolf', 'werewolves');
  add(c.seer, 'seer', 'seers');
  add(c.doctor, 'doctor', 'doctors');
  add(c.villager, 'villager', 'villagers');
  return parts.join(', ');
}

/** The pack, for the wolves' screen ("Your pack: Ada, Bayo"). Empty for everyone else. */
export function packLine(view: WerewolfView, myId: string, nameOf: NameOf): string {
  const mates = (view.wolves ?? []).filter((w) => w !== myId).map((w) => nameOf(w));
  return mates.length > 0 ? `Your pack: ${joinNames(mates)}` : 'You hunt alone';
}
