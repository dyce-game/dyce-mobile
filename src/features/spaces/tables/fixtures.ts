import {
  crazyCardsAutoAction,
  crazyCardsEngine,
  whotAutoAction,
  whotEngine,
  type CrazyCardsState,
  type WhotState,
} from '@dyce/games';
import type { LiveState } from '@dyce/shared';
import { buildTableModel, type TableModel } from './model';

/**
 * Test helpers: real engine states turned into the live state a seat is sent, so the tests exercise the
 * parsers and the model against what the room really sends (not hand-made JSON that could drift).
 */

export const PLAYERS = ['ada', 'bola', 'chi', 'dayo'];

export const nameOf = (id: string): string =>
  ({ ada: 'Ada', bola: 'Bola', chi: 'Chi', dayo: 'Dayo' })[id] ?? id;

type AnyState = CrazyCardsState | WhotState;
type Slug = 'whot' | 'crazy-cards';

export function initState(slug: Slug, players: string[], seed = 7n): AnyState {
  return slug === 'whot'
    ? whotEngine.init(players, seed, {})
    : crazyCardsEngine.init(players, seed, {});
}

export function viewOf(slug: Slug, s: AnyState, viewer: string): unknown {
  return slug === 'whot'
    ? whotEngine.view(s as WhotState, viewer)
    : crazyCardsEngine.view(s as CrazyCardsState, viewer);
}

export function currentOf(slug: Slug, s: AnyState): string {
  const st = s as { players: string[]; turn: number };
  return st.players[st.turn]!;
}

/** The live state a seat is sent for `s`. */
export function liveFor(
  slug: Slug,
  s: AnyState,
  viewer: string,
  extra: Partial<LiveState> = {},
): LiveState {
  const over = (s as { endReason: unknown }).endReason !== null;
  const players = (s as { players: string[] }).players;
  return {
    matchId: 'm1',
    spaceId: 's1',
    gameSlug: slug,
    mode: 'free',
    version: (s as { seq: number }).seq,
    status: over ? 'finished' : 'live',
    view: viewOf(slug, s, viewer),
    seats: players.map((userId, seat) => ({ userId, seat, connected: true, forfeited: false })),
    turnUserId: over ? null : currentOf(slug, s),
    turnDeadlineAt: null,
    roomKind: 'turns',
    canAct: !over && currentOf(slug, s) === viewer,
    waiting: false,
    serverNow: 0,
    results: null,
    ...extra,
  } as LiveState;
}

export function modelFor(
  slug: Slug,
  s: AnyState,
  viewer: string,
  extra: Partial<LiveState> = {},
): TableModel {
  const m = buildTableModel(slug, liveFor(slug, s, viewer, extra), viewer, nameOf);
  if (!m) throw new Error('model did not build');
  return m;
}

/** Plays the server's own auto move for whoever is up, `n` times (or until the game ends). */
export function advance(slug: Slug, s: AnyState, n: number): AnyState {
  let cur = s;
  for (let i = 0; i < n; i++) {
    const st = cur as { endReason: unknown };
    if (st.endReason !== null) break;
    const by = currentOf(slug, cur);
    if (slug === 'whot') {
      const a = whotAutoAction(cur as WhotState, by);
      cur = whotEngine.apply(cur as WhotState, by, a);
    } else {
      const a = crazyCardsAutoAction(cur as CrazyCardsState, by);
      cur = crazyCardsEngine.apply(cur as CrazyCardsState, by, a);
    }
  }
  return cur;
}
