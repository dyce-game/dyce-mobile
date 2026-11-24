import {
  formatNaira,
  type SpaceMember,
  type SpacePayoutScheme,
  type SpaceView,
  type SpaceVisibility,
} from '@dyce/shared';

/**
 * Pure logic for Spaces (design: Space, CreateRoom, JoinRoom, Lobby, RoomResult): what a card says, how a
 * live update merges into the cache, how a pot is split. Money is integer kobo throughout and shown through
 * `formatNaira`. No React in here, so it is unit tested. The server decides all of it; this only describes.
 */

const NAIRA = 100;

/** The seat-fee chips in Create a space (design: Ð200, Ð500, Ð1,000, Ð2,000). */
export const SEAT_FEE_PRESETS_KOBO = [200, 500, 1_000, 2_000].map((n) => n * NAIRA);

/** The presets that are inside the server's limits. */
export function seatFeeChoices(
  info: { minStakeKobo: number; maxStakeKobo: number } | undefined,
): number[] {
  const min = info?.minStakeKobo ?? 100 * NAIRA;
  const max = info?.maxStakeKobo ?? 20_000 * NAIRA;
  return SEAT_FEE_PRESETS_KOBO.filter((s) => s >= min && s <= max);
}

export const SCHEME_LABEL: Record<SpacePayoutScheme, string> = {
  winner_all: 'Winner all',
  p60_40: '60 / 40',
  p50_30_20: '50 / 30 / 20',
};

const SCHEME_WEIGHTS: Record<SpacePayoutScheme, number[]> = {
  winner_all: [100],
  p60_40: [60, 40],
  p50_30_20: [50, 30, 20],
};

/** Payout schemes a host can pick for a space of `maxSeats` (50/30/20 needs a third seat). */
export function schemesFor(maxSeats: number): SpacePayoutScheme[] {
  return maxSeats >= 3 ? ['winner_all', 'p60_40', 'p50_30_20'] : ['winner_all', 'p60_40'];
}

/**
 * What each place takes from a pot of `potKobo` for `players` people: the same arithmetic as the database's
 * `settle_match` (floors, the remainder to first place), so the preview matches what is paid. Two players
 * who picked 50/30/20 are paid 60/40.
 */
export function payoutSplit(
  potKobo: number,
  scheme: SpacePayoutScheme,
  players: number,
): { place: number; kobo: number }[] {
  const effective: SpacePayoutScheme = players === 2 && scheme === 'p50_30_20' ? 'p60_40' : scheme;
  const weights = SCHEME_WEIGHTS[effective].slice(0, Math.max(1, players));
  const total = weights.reduce((a, b) => a + b, 0);
  const slots = weights.map((w) => Math.floor((potKobo * w) / total));
  slots[0] = (slots[0] ?? 0) + (potKobo - slots.reduce((a, b) => a + b, 0));
  return slots.map((kobo, i) => ({ place: i + 1, kobo }));
}

export const ordinal = (n: number): string =>
  n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

export const visibilityLabel = (v: SpaceVisibility): string =>
  v === 'friends' ? 'Friends only' : 'Anyone with the code';

/** "Whot! · 2 of 4 seated" */
export function spaceMeta(s: Pick<SpaceView, 'gameName' | 'members' | 'maxSeats' | 'status'>) {
  const n = s.members.length;
  if (s.status === 'live') return `${s.gameName} · ${n} playing`;
  if (s.status === 'ended') return `${s.gameName} · finished`;
  return `${s.gameName} · ${n} of ${s.maxSeats} seated`;
}

/** The mode line on a card: "Free", or "Pool · Ð500 a seat · 50 / 30 / 20". */
export function modeLine(s: Pick<SpaceView, 'mode' | 'seatFeeKobo' | 'payoutScheme'>): string {
  return s.mode === 'pool'
    ? `Pool · ${formatNaira(s.seatFeeKobo)} a seat · ${SCHEME_LABEL[s.payoutScheme]}`
    : 'Free';
}

export const STATUS_LABEL: Record<SpaceView['status'], string> = {
  waiting: 'WAITING',
  live: 'LIVE',
  ended: 'ENDED',
  closed: 'CLOSED',
};

/** The big button in the lobby for this person, and whether it can be pressed. */
export function lobbyAction(s: SpaceView): {
  label: string;
  enabled: boolean;
  hint: string | null;
} {
  const seated = s.members.length;
  if (!s.hosting) {
    return {
      label: 'Waiting for the host',
      enabled: false,
      hint: s.startRule === 'when_full' ? 'It starts when every seat is taken' : null,
    };
  }
  if (seated < s.minSeats) {
    return {
      label: `Waiting for ${s.minSeats - seated} more`,
      enabled: false,
      hint: `You need at least ${s.minSeats} players`,
    };
  }
  return {
    label: `Start with ${seated} players`,
    enabled: true,
    hint:
      seated < s.maxSeats
        ? s.mode === 'pool'
          ? 'Empty seats are left out of the pot'
          : 'Empty seats stay empty'
        : null,
  };
}

/** What a person's row on the results screen says: their prize, or what they put in. */
export function prizeText(s: Pick<SpaceView, 'mode' | 'seatFeeKobo'>, m: SpaceMember): string {
  if (s.mode !== 'pool') return m.placement === 1 ? 'Winner' : '';
  const paid = m.payoutKobo ?? 0;
  if (paid > 0) return formatNaira(paid);
  return `−${formatNaira(m.stakedKobo || s.seatFeeKobo)}`;
}

/** Net result for one person: what came back minus what they put in. */
export function netKobo(m: Pick<SpaceMember, 'payoutKobo' | 'stakedKobo'>): number {
  return (m.payoutKobo ?? 0) - m.stakedKobo;
}

/** Merge a live `space` event into the cache: the newer view wins; an older one never replaces a newer one. */
export function newerSpace(cached: SpaceView | undefined, incoming: SpaceView): SpaceView {
  if (!cached) return incoming;
  const rank = { waiting: 0, live: 1, ended: 2, closed: 2 } as const;
  if (rank[incoming.status] < rank[cached.status]) return cached;
  return incoming;
}

/** Whether the live table should be open for this space (it is running and the person is seated). */
export const isTableOpen = (s: SpaceView): boolean => s.status === 'live' && s.seated;
