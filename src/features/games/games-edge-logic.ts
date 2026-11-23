import { formatNaira, type MatchView } from '@dyce/shared';
import { reportHref } from '../safety/safety-logic';

/**
 * Pure logic for the game menu and the connection states of the game host (design: GameMenu, GameForfeit,
 * GameOffline; SPEC section 9). The wording states the real rules: resigning forfeits the game, in Pool the pot goes
 * to the opponent, and nothing happens to an async game while you are offline (there is no turn timer yet, so
 * there is no grace-period countdown to show). No React, so it is unit tested.
 */

/** A failed API call as the host sees it (`ApiError` has these fields; status 0 / code 'network' = unreachable). */
type FailedCall = { status?: number; code?: string } | null | undefined;

/** True when the call failed because the phone could not reach the server at all. */
export function isNetworkFailure(err: unknown): boolean {
  const e = err as FailedCall;
  return !!e && (e.code === 'network' || e.status === 0);
}

/** You can resign a running 1v1 game you play in. (Waiting for the invite, or finished: no.) */
export function canResign(match: MatchView, myId: string | null): boolean {
  return (
    match.status === 'active' &&
    match.players.length === 2 &&
    match.players.some((p) => p.userId === myId)
  );
}

export type ResignCopy = {
  title: string;
  body: string;
  /** The pill under the text: what is at stake. Null in Free. */
  chip: string | null;
  confirm: string;
  /** The line on the menu row ("Resign and lose ₦1,000"). */
  menuLabel: string;
};

/** What resigning costs, in the words the confirm sheet and the menu row use. */
export function resignCopy(match: MatchView, oppName: string): ResignCopy {
  if (match.mode === 'pool') {
    const stake = formatNaira(match.stakeKobo);
    const pot = formatNaira(match.potKobo);
    return {
      title: 'Resign this game?',
      body: `${oppName} wins and takes the ${pot} pot. You lose your ${stake} stake. This can’t be undone.`,
      chip: `${pot} at stake`,
      confirm: `Resign and lose ${stake}`,
      menuLabel: `Resign and lose ${stake}`,
    };
  }
  return {
    title: 'Resign this game?',
    body: `${oppName} wins. No Dyce Cash moves because this is a Free game. This can’t be undone.`,
    chip: null,
    confirm: 'Resign',
    menuLabel: 'Resign',
  };
}

export type StateCopy = { title: string; body: string; chip: string | null };

/** You lost your connection while a game from the chat is open. */
export function offlineCopy(match: MatchView): StateCopy {
  return {
    title: 'You’re offline',
    body: 'We’ll reconnect as soon as your connection is back. Nothing happens to the game while you’re away, and a move that didn’t send can be played again.',
    chip: match.mode === 'pool' ? `${formatNaira(match.potKobo)} pot is safe` : null,
  };
}

/** The same, at a live table: the server keeps your seat for 60 seconds (backend ADR-022). */
export function tableOfflineCopy(potKobo: number): StateCopy {
  return {
    title: 'You’re offline',
    body: 'Reconnecting… The table keeps your seat for 60 seconds. If you’re not back by then, your seat forfeits.',
    chip: potKobo > 0 ? `${formatNaira(potKobo)} pot` : null,
  };
}

/** Someone else at the table lost their connection. */
export function opponentIssueCopy(names: string[], potKobo: number): StateCopy {
  const who =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : 'A few players';
  return {
    title: `${who} lost connection`,
    body: 'Waiting up to 60 seconds for them to come back. If they don’t, their seat forfeits and the game goes on without them.',
    chip: potKobo > 0 ? `${formatNaira(potKobo)} pot is safe` : null,
  };
}

/** The link the menu's "Report" row opens (the Report screen, with the chat's messages attachable). */
export function reportOpponentHref(match: MatchView, myId: string | null): string | null {
  const opp = match.players.find((p) => p.userId !== myId);
  if (!opp) return null;
  return reportHref({
    userId: opp.userId,
    username: opp.username,
    name: opp.displayName,
    conversationId: match.conversationId ?? undefined,
  });
}
