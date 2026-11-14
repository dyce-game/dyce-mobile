/**
 * Errors raised by our SQL functions look like `dyce:<code>` (see db/migrations/0005).
 * This turns them into typed errors the HTTP layer can map to status codes.
 */
export const DYCE_ERROR_CODES = [
  'insufficient_funds',
  'invalid_amount',
  'self_payment',
  'blocked',
  'over_send_limit',
  'over_daily_limit',
  'request_not_found',
  'request_already_paid',
  'request_cancelled',
  'request_expired',
  'request_not_for_you',
  'amount_mismatch',
  'amount_required',
  'too_many_open_requests',
  'adult_required',
  'pool_frozen',
  'not_a_pool_match',
  'not_a_player',
  'match_not_found',
  'match_closed',
  'over_pool_stake_limit',
  'over_pool_games_limit',
  'placements_missing',
  'already_settled',
  'topup_already_claimed',
  'balance_too_high',
  'recipient_unavailable',
  'no_wallet',
] as const;

export type DyceErrorCode = (typeof DYCE_ERROR_CODES)[number];

export class DyceError extends Error {
  readonly code: DyceErrorCode;
  constructor(code: DyceErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'DyceError';
    this.code = code;
  }
}

const KNOWN = new Set<string>(DYCE_ERROR_CODES);

/** Returns a DyceError if `err` is one of ours, else undefined (caller rethrows the original). */
export function parseDbError(err: unknown): DyceError | undefined {
  const message = err instanceof Error ? err.message : undefined;
  if (!message?.startsWith('dyce:')) return undefined;
  const code = message.slice('dyce:'.length);
  return KNOWN.has(code) ? new DyceError(code as DyceErrorCode, { cause: err }) : undefined;
}

/** HTTP status for each code: 402-style money problems are 409/422, never 500. */
export function httpStatusFor(code: DyceErrorCode): number {
  switch (code) {
    case 'request_not_found':
    case 'match_not_found':
    case 'no_wallet':
      return 404;
    case 'blocked':
    case 'adult_required':
    case 'pool_frozen':
    case 'not_a_player':
    case 'request_not_for_you':
      return 403;
    case 'over_send_limit':
    case 'over_daily_limit':
    case 'over_pool_stake_limit':
    case 'over_pool_games_limit':
    case 'too_many_open_requests':
      return 429;
    case 'invalid_amount':
    case 'amount_required':
    case 'amount_mismatch':
    case 'self_payment':
    case 'recipient_unavailable':
      return 422;
    default:
      return 409; // insufficient_funds, already paid/settled/expired/cancelled, closed, etc.
  }
}
