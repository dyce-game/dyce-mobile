/**
 * Pure helpers for invite links (docs/DECISIONS.md ADR-021). A link looks like
 * `https://dyce.games/i/<token>#p=<digits of the invited number>`. The token says which invite; the fragment
 * carries the invitee's own number back to their browser or app so sign-up can be prefilled. A fragment is
 * never sent to a server, so we learn nothing from it.
 */

const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

export type InviteLink = { token: string; phone: string | null };

/** "+23481..." from "p=23481..." in a fragment (with or without the "#"), or null. */
export function phoneFromFragment(fragment: string | null | undefined): string | null {
  if (!fragment) return null;
  const f = fragment.startsWith('#') ? fragment : `#${fragment}`;
  const m = /[#&]p=(\d{7,15})(?:&|$)/.exec(f);
  return m ? `+${m[1]}` : null;
}

/**
 * Reads an invite out of a full link (`https://dyce.games/i/<token>#p=…`), an app link (`dyce://i/<token>`) or
 * a bare path (`/i/<token>`). Anything else is not an invite.
 */
export function parseInviteLink(url: string | null | undefined): InviteLink | null {
  if (!url) return null;
  const hashAt = url.indexOf('#');
  const fragment = hashAt >= 0 ? url.slice(hashAt) : '';
  const rest = (hashAt >= 0 ? url.slice(0, hashAt) : url).split('?')[0]!;
  const m = /(?:^|\/)i\/([A-Za-z0-9_-]+)\/?$/.exec(rest);
  if (!m || !TOKEN.test(m[1]!)) return null;
  return { token: m[1]!, phone: phoneFromFragment(fragment) };
}

/**
 * Splits "+2348125590034" into the country dial code we offer and the rest, choosing the longest dial code that
 * matches. `dials` are the codes the phone screen has ("+234", "+1", ...).
 */
export function splitDial(
  e164: string,
  dials: readonly string[],
): { dial: string; national: string } | null {
  let best: string | null = null;
  for (const d of dials) if (e164.startsWith(d) && (!best || d.length > best.length)) best = d;
  return best ? { dial: best, national: e164.slice(best.length) } : null;
}

/** What a finished guest round says: "5 words · 12 points". */
export function guestSummary(words: number, score: number): string {
  return `${words} ${words === 1 ? 'word' : 'words'} · ${score} ${score === 1 ? 'point' : 'points'}`;
}
