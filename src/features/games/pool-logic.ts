import { formatNaira, type GameCardPayload, type MatchView, type PoolInfo } from '@dyce/shared';

/**
 * Pure logic for Pool mode (design: ModeSheet, PoolInvite, CounterReceived, PoolResult, PoolIssues): the
 * stake presets, the lines a card and the results screen show, and which of the daily limits was hit.
 * Money is integer kobo throughout and shown through `formatNaira`. No React in here, so it is unit tested.
 */

const NAIRA = 100;

/** The stake chips in the mode sheet (design: Ð200, Ð500, Ð1k, Ð2k, Ð5k). */
export const STAKE_PRESETS_KOBO = [200, 500, 1_000, 2_000, 5_000].map((n) => n * NAIRA);

/**
 * The presets that are inside the server's limits (the limits come from config, not the app) and above the
 * game's own Pool minimum, if it has one (docs/GAMES.md; the server enforces it).
 */
export function stakeChoices(
  info: Pick<PoolInfo, 'minStakeKobo' | 'maxStakeKobo'> | undefined,
  gameMinKobo?: number | null,
) {
  const min = Math.max(info?.minStakeKobo ?? 100 * NAIRA, gameMinKobo ?? 0);
  const max = info?.maxStakeKobo ?? 20_000 * NAIRA;
  return STAKE_PRESETS_KOBO.filter((s) => s >= min && s <= max);
}

/** "Ð1k" for a chip: whole thousands abbreviated, the rest in full. */
export function stakeChipLabel(kobo: number): string {
  const naira = kobo / NAIRA;
  return naira >= 1_000 && naira % 1_000 === 0 ? `Ð${naira / 1_000}k` : formatNaira(kobo);
}

/** The default stake: Ð1,000 if it is on offer, else the first choice. */
export function defaultStake(choices: number[]): number {
  return choices.includes(1_000 * NAIRA) ? 1_000 * NAIRA : (choices[0] ?? 1_000 * NAIRA);
}

/** What the winner takes. */
export const potOf = (stakeKobo: number) => stakeKobo * 2;

/**
 * The rule line on the mode sheet (SPEC section 9): who gets what, in plain words. The 24 hours are the server's
 * `pool_turn_hours` (backend ADR-041): an invite nobody answers is refunded, and a player who does not move in
 * that time forfeits.
 */
export function poolRuleLine(stakeKobo: number, hours = 24): string {
  return `Winner takes ${formatNaira(potOf(stakeKobo))}. A draw refunds both. No reply in ${hours} hours refunds you. No move for ${hours} hours is a forfeit.`;
}

/**
 * "23h 10m" until a Pool match's turn clock runs out (the player to move forfeits), from an ISO time; null for a
 * match with no clock or one that has already run out.
 */
export function forfeitIn(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const secs = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (secs <= 0) return null;
  return resetsIn(secs);
}

/**
 * The counter-offers on offer for an invite of `stakeKobo`: up to two smaller stakes from the presets
 * (largest first) and "Free" (0). Never more than the invite, never below the minimum.
 */
export function counterChoices(stakeKobo: number, minStakeKobo = 100 * NAIRA): number[] {
  const smaller = STAKE_PRESETS_KOBO.filter((s) => s < stakeKobo && s >= minStakeKobo)
    .sort((a, b) => b - a)
    .slice(0, 2);
  return [...smaller, 0];
}

export const counterLabel = (kobo: number): string => (kobo === 0 ? 'Free' : stakeChipLabel(kobo));

/** Which of the server's daily Pool limits would a new stake of `stakeKobo` run into? */
export function dailyLimitHit(info: PoolInfo, stakeKobo: number): 'stake' | 'games' | null {
  if (info.gamesToday + 1 > info.dailyGamesLimit) return 'games';
  if (info.stakedTodayKobo + stakeKobo > info.dailyStakeLimitKobo) return 'stake';
  return null;
}

/** "4h 19m", "35m" or "1m": how long until the daily limits reset. */
export function resetsIn(seconds: number): string {
  const mins = Math.max(1, Math.ceil(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The error codes that mean "you can't stake right now" and open the Pool issue screen. */
export type PoolIssueKind = 'low-balance' | 'limit';
export function poolIssueOf(code: string | undefined): PoolIssueKind | null {
  if (code === 'insufficient_funds') return 'low-balance';
  if (code === 'over_pool_stake_limit' || code === 'over_pool_games_limit') return 'limit';
  return null;
}

// ---- what a Pool card says -----------------------------------------------------------------------

/** "Expires in 23:41" from an ISO time; null once it has passed. */
export function expiresIn(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const secs = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The pot line on a card: "Pot Ð2,000 · locked until the game ends" while it is open or running, "Pot Ð2,000"
 * once it is over, nothing when it never started (the text above already says the stake came back) or in Free.
 * With a counter-offer waiting it shows the pot as it would be if the offer were accepted.
 */
export function potLine(
  payload: Pick<GameCardPayload, 'mode' | 'stakeKobo' | 'potKobo' | 'status' | 'counterStakeKobo'>,
): string | null {
  if (payload.mode !== 'pool' || !payload.potKobo) return null;
  if (payload.status === 'cancelled' || payload.status === 'expired') return null;
  if (payload.status === 'finished') return `Pot ${formatNaira(payload.potKobo)}`;
  if (payload.status === 'countered' && payload.counterStakeKobo !== null) {
    return payload.counterStakeKobo === 0
      ? null
      : `Pot ${formatNaira(payload.counterStakeKobo * 2)} if accepted`;
  }
  return `Pot ${formatNaira(payload.potKobo)} · locked until the game ends`;
}

// ---- results -------------------------------------------------------------------------------------

export type PoolResult = {
  outcome: 'won' | 'lost' | 'draw';
  /** The big number: "+Ð1,000", "−Ð1,000", "Pot split". */
  amount: string;
  /** The lines under it. */
  lines: { label: string; value: string }[];
  /** A sentence for a screen reader. */
  spoken: string;
};

/**
 * What a finished Pool match did to YOUR wallet, from the server's payout figures (never computed from the
 * score). `balanceKobo` is your balance now, when known.
 */
export function poolResult(
  match: MatchView,
  myId: string | null,
  oppName: string,
  balanceKobo: number | null,
): PoolResult | null {
  if (match.mode !== 'pool' || match.status !== 'finished') return null;
  const me = match.players.find((p) => p.userId === myId);
  const them = match.players.find((p) => p.userId !== myId);
  if (!me || !them) return null;
  const staked = me.stakedKobo;
  const paid = me.payoutKobo ?? 0;
  const net = paid - staked;
  const balance =
    balanceKobo === null ? [] : [{ label: 'New balance', value: formatNaira(balanceKobo) }];
  const fee = { label: 'Dyce fee', value: formatNaira(0) };

  if (match.outcome?.draw) {
    return {
      outcome: 'draw',
      amount: 'Pot split',
      lines: [
        { label: 'Back to you', value: formatNaira(paid) },
        { label: `Back to ${oppName}`, value: formatNaira(them.payoutKobo ?? them.stakedKobo) },
        ...balance,
      ],
      spoken: `It's a draw. Your ${formatNaira(paid)} stake went back to you.`,
    };
  }
  if (net > 0) {
    return {
      outcome: 'won',
      amount: `+${formatNaira(net)}`,
      lines: [
        { label: 'Pot', value: formatNaira(match.potKobo) },
        { label: 'Your stake back', value: formatNaira(staked) },
        { label: `${oppName}'s stake`, value: formatNaira(them.stakedKobo) },
        fee,
        ...balance,
      ],
      spoken: `You won the pool. ${formatNaira(match.potKobo)} paid to you, ${formatNaira(net)} more than you put in.`,
    };
  }
  return {
    outcome: 'lost',
    amount: `−${formatNaira(staked)}`,
    lines: [
      { label: 'Your stake', value: formatNaira(staked) },
      { label: `Paid to ${oppName}`, value: `${formatNaira(match.potKobo)} pot` },
      ...balance,
    ],
    spoken: `${oppName} took the pool. You lost your ${formatNaira(staked)} stake.`,
  };
}
