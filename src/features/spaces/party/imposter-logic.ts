import { joinNames, type NameOf } from './common-logic';
import type { ImposterView } from './views';

/**
 * Imposter, from the player's own view: what the screen says in each phase, the clue and vote rules the
 * UI mirrors (the engine is the judge), and the end-of-game summary. Rules: backend ADR-023.
 */

/** Clue rules (engine): one to three words. */
export const CLUE_MAX_WORDS = 3;
export const CLUE_MAX_CHARS = 60;

export function clueWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** What is wrong with a clue, or null when it can be sent. */
export function clueProblem(text: string): string | null {
  const words = clueWords(text);
  if (words.length === 0) return 'Say something first.';
  if (words.length > CLUE_MAX_WORDS) return 'A clue is one to three words.';
  if (text.trim().length > CLUE_MAX_CHARS) return 'That clue is too long.';
  return null;
}

/** Picks a suspect (or drops one): at most `max` at a time, the oldest pick makes room for a new one. */
export function toggleVote(picked: readonly string[], id: string, max: number): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  const next = [...picked, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

export const voteComplete = (picked: readonly string[], need: number): boolean =>
  picked.length === need;

/** Who you can suspect: everyone else at the table, in table order. */
export const suspects = (view: ImposterView, myId: string): string[] =>
  view.players.filter((p) => p !== myId);

/** The most recent clue each player gave (null text = they ran out of time). */
export function latestClues(view: ImposterView): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const c of view.clues) out.set(c.by, c.text);
  return out;
}

/** All of one round's clues in the order they were given. */
export function cluesOfRound(view: ImposterView, round: number) {
  return view.clues.filter((c) => c.round === round);
}

export const imposterWord = (n: number): string => (n === 1 ? 'imposter' : 'imposters');

export type StageTone = 'neutral' | 'yours' | 'danger' | 'good';
export type Stage = {
  headline: string;
  sub: string;
  /** What the main button does for you now (the screen draws it), or null. */
  action: 'ready' | 'clue' | 'vote' | 'guess' | null;
  tone: StageTone;
};

/** The headline and the one thing you can do, for the phase the table is in. */
export function imposterStage(view: ImposterView, myId: string, nameOf: NameOf): Stage {
  const me = view.players.includes(myId);
  const n = view.imposterCount;
  switch (view.phase) {
    case 'reveal': {
      const ready = view.ready.includes(myId);
      return {
        headline: ready ? 'Waiting for everyone' : 'Check your role',
        sub: ready
          ? `${view.ready.length} of ${view.players.length} ready`
          : 'Hold the card to look. Nobody else should see it.',
        action: me && !ready ? 'ready' : null,
        tone: 'neutral',
      };
    }
    case 'clue': {
      const mine = view.speaker === myId;
      const round = `Round ${view.round ?? 1} of ${view.clueRounds}`;
      return mine
        ? {
            headline: 'Your clue',
            sub: `One to three words. ${round}.`,
            action: 'clue',
            tone: 'yours',
          }
        : {
            headline: `${nameOf(view.speaker)} is giving a clue`,
            sub: round,
            action: null,
            tone: 'neutral',
          };
    }
    case 'vote': {
      const voted = view.voted.includes(myId);
      return voted
        ? {
            headline: 'Vote locked in',
            sub: `${view.voted.length} of ${view.players.length} have voted`,
            action: null,
            tone: 'neutral',
          }
        : {
            headline: n === 1 ? 'Who is the imposter?' : `Who are the ${n} imposters?`,
            sub: `Pick ${n} ${n === 1 ? 'player' : 'players'}, then vote.`,
            action: me ? 'vote' : null,
            tone: 'yours',
          };
    }
    case 'guess': {
      const mine = view.role === 'imposter' && !view.guessed.includes(myId);
      if (mine) {
        return {
          headline: 'You were caught',
          sub: 'Guess the secret word to steal the round.',
          action: 'guess',
          tone: 'danger',
        };
      }
      return {
        headline: n === 1 ? 'The imposter was caught' : 'The imposters were caught',
        sub: 'They get one guess at the word.',
        action: null,
        tone: 'neutral',
      };
    }
    case 'over': {
      const crewWon = view.winner === 'crew';
      const iAmImposter = view.role === 'imposter';
      const iWon = crewWon ? !iAmImposter : iAmImposter;
      return {
        headline: crewWon ? 'The crew wins' : 'The imposters win',
        sub: me ? (iWon ? 'You are on the winning side.' : 'Not your round.') : '',
        action: null,
        tone: iWon ? 'good' : 'danger',
      };
    }
  }
}

export type RoleCard = {
  kind: 'crew' | 'imposter' | 'unknown';
  /** The big line on the card. */
  title: string;
  /** The word, for crew (and for everyone once it is over). */
  word: string | null;
  /** The small line under it. */
  hint: string;
  /** Spoken when the card is shown. */
  spoken: string;
};

/** What your role card says. The word only exists in the view when you are allowed to read it. */
export function roleCard(view: ImposterView, nameOf: NameOf): RoleCard {
  if (view.role === 'imposter') {
    const mates = view.partners.map((p) => nameOf(p));
    return {
      kind: 'imposter',
      title: 'Imposter',
      word: null,
      hint:
        mates.length > 0
          ? `Your partner: ${joinNames(mates)}. Blend in.`
          : 'Only you do not know the word. Blend in.',
      spoken: `You are the imposter.${mates.length > 0 ? ` Your partner is ${joinNames(mates)}.` : ''}`,
    };
  }
  if (view.role === 'crew' && view.word) {
    return {
      kind: 'crew',
      title: view.word,
      word: view.word,
      hint: 'Give a clue that is close, not obvious.',
      spoken: `Your secret word is ${view.word}.`,
    };
  }
  return {
    kind: 'unknown',
    title: 'Watching',
    word: view.word,
    hint: 'You are not playing this round.',
    spoken: 'You are watching this round.',
  };
}

export type EndSummary = {
  winnerLine: string;
  imposters: string;
  word: string;
  /** What each imposter guessed at the end, if they got a guess. */
  guesses: string[];
  /** How the vote went ("Ife 3 votes"), most first. */
  tally: string[];
};

export function endSummary(view: ImposterView, nameOf: NameOf): EndSummary {
  const imps = (view.imposters ?? []).map((p) => nameOf(p));
  const guesses = Object.entries(view.guesses ?? {}).map(
    ([by, text]) => `${nameOf(by)} guessed “${text}”`,
  );
  const tally = Object.entries(view.tally ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([p, v]) => `${nameOf(p)}: ${v} ${v === 1 ? 'vote' : 'votes'}`);
  return {
    winnerLine: view.winner === 'crew' ? 'The crew found the imposter.' : 'The imposters got away.',
    imposters: imps.length > 0 ? joinNames(imps) : 'Unknown',
    word: view.word ?? '—',
    guesses,
    tally,
  };
}

/** Votes against a player once the tally is public (guess phase and after); null while it is secret. */
export function votesAgainst(view: ImposterView, id: string): number | null {
  return view.tally ? (view.tally[id] ?? 0) : null;
}

/** Who has not voted yet, for the "waiting for" line. */
export const notVoted = (view: ImposterView): string[] =>
  view.players.filter((p) => !view.voted.includes(p));
