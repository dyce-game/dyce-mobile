import { formatNaira, type PoolInfo } from '@dyce/shared';

/**
 * The "How Pool works" rules (design: PoolRules), in the words of the product docs (SPEC section 9) and with the
 * numbers the server is actually using. Where the design and the docs disagree the docs win: stakes run to
 * ₦20,000 (not ₦50,000), Spaces pay "winner takes all", 60 / 40 or 50 / 30 / 20, and the daily top-up is for
 * balances under ₦10,000. Pure: no React, so it is unit tested.
 */

const NAIRA = 100;

export type PoolRule = { n: string; tone: 'ember' | 'warn' | 'free'; title: string; body: string };

type Limits = Pick<
  PoolInfo,
  'minStakeKobo' | 'maxStakeKobo' | 'dailyGamesLimit' | 'dailyStakeLimitKobo'
>;

const DEFAULTS: Limits = {
  minStakeKobo: 100 * NAIRA,
  maxStakeKobo: 20_000 * NAIRA,
  dailyGamesLimit: 20,
  dailyStakeLimitKobo: 100_000 * NAIRA,
};

export function poolRules(info?: Partial<Limits>): PoolRule[] {
  const l = { ...DEFAULTS, ...info };
  return [
    {
      n: '1',
      tone: 'ember',
      title: 'Your stake locks when you send',
      body: `It sits in the pot, not with the other player. Stakes run from ${formatNaira(l.minStakeKobo)} to ${formatNaira(l.maxStakeKobo)}.`,
    },
    {
      n: '2',
      tone: 'ember',
      title: 'They match, counter, or go free',
      body: 'Nothing leaves their wallet until they match. They can suggest a different stake once. Not answered in 24 hours? You get yours back.',
    },
    {
      n: '3',
      tone: 'ember',
      title: 'Winner takes the pot',
      body: 'A draw gives both stakes back. Dyce takes no cut.',
    },
    {
      n: '4',
      tone: 'ember',
      title: 'Spaces can split the pot',
      body: 'Winner takes all, 60 / 40, or 50 / 30 / 20 for the top three. The host picks before anyone pays in.',
    },
    {
      n: '5',
      tone: 'warn',
      title: 'Leaving counts as a forfeit',
      body: 'Resigning forfeits the game and the pot goes to your opponent. In a Space your seat is kept for 60 seconds if your connection drops, then it forfeits.',
    },
    {
      n: '6',
      tone: 'warn',
      title: 'Think a result is wrong?',
      body: 'Dispute it within 24 hours from the result screen. A person reviews the game, and a wrong result is corrected.',
    },
    {
      n: '7',
      tone: 'free',
      title: 'Running low?',
      body: `Under ${formatNaira(10_000 * NAIRA)} you can claim a free daily top-up, and Free games are always open. Dyce Cash is virtual: it can’t be bought or withdrawn.`,
    },
  ];
}

/** Today's limits as two lines: "Up to 20 Pool games a day" and "Up to ₦100,000 staked a day". */
export function poolLimitLines(info?: Partial<Limits>): string[] {
  const l = { ...DEFAULTS, ...info };
  return [
    `Up to ${l.dailyGamesLimit} Pool games a day`,
    `Up to ${formatNaira(l.dailyStakeLimitKobo)} staked a day`,
  ];
}

/** "You've used 3 of 20 games and ₦4,000 of ₦100,000 today" (null before the numbers have loaded). */
export function poolUsageLine(
  info?: Pick<
    PoolInfo,
    'gamesToday' | 'dailyGamesLimit' | 'stakedTodayKobo' | 'dailyStakeLimitKobo'
  >,
): string | null {
  if (!info) return null;
  return `Today you have used ${info.gamesToday} of ${info.dailyGamesLimit} games and ${formatNaira(info.stakedTodayKobo)} of ${formatNaira(info.dailyStakeLimitKobo)}.`;
}
