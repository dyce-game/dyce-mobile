import { DYCE_ERROR_CODES, DyceError, httpStatusFor, parseDbError } from './dyce-error.ts';

describe('parseDbError', () => {
  it('maps dyce:<code> messages to typed errors', () => {
    const e = parseDbError(new Error('dyce:insufficient_funds'));
    expect(e).toBeInstanceOf(DyceError);
    expect(e?.code).toBe('insufficient_funds');
  });
  it('ignores unknown codes and foreign errors', () => {
    expect(parseDbError(new Error('dyce:made_up'))).toBeUndefined();
    expect(parseDbError(new Error('connection refused'))).toBeUndefined();
    expect(parseDbError('dyce:insufficient_funds')).toBeUndefined();
  });
});

describe('httpStatusFor', () => {
  it('never maps a known money error to 5xx', () => {
    for (const code of DYCE_ERROR_CODES) {
      const s = httpStatusFor(code);
      expect(s).toBeGreaterThanOrEqual(400);
      expect(s).toBeLessThan(500);
    }
  });
});

/**
 * Keeps the TypeScript list and the SQL functions in step: every code raised in the migrations
 * must be known here, otherwise the API would surface it as a 500.
 */
describe('migrations vs DYCE_ERROR_CODES', () => {
  it('knows every dyce:<code> raised by the money functions', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const sql = await readFile(
      join(process.cwd(), 'db/migrations/0005_money_functions.sql'),
      'utf8',
    );
    const raised = new Set([...sql.matchAll(/'dyce:([a-z_]+)'/g)].map((m) => m[1]!));
    // internal-only guards that indicate a bug, not a user error
    const internal = new Set([
      'unbalanced_txn',
      'escrow_underflow',
      'escrow_mismatch',
      'invalid_reason',
      'invalid_ttl',
      'nothing_to_settle',
      'txn_not_found',
      'cannot_reverse_a_reversal',
      'not_a_pool_match_internal',
    ]);
    const missing = [...raised].filter(
      (c) => !(DYCE_ERROR_CODES as readonly string[]).includes(c) && !internal.has(c),
    );
    expect(missing).toEqual([]);
  });
});
