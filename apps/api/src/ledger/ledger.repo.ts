import type pg from 'pg';
import { parseDbError } from '../common/dyce-error.ts';

export type LedgerResult = { txnId: string | null; replayed: boolean };

export type PaymentRequest = {
  id: string;
  code: string;
  requester: string;
  amountKobo: number | null;
  note: string;
  targetUser: string | null;
  status: 'open' | 'paid' | 'expired' | 'cancelled';
  expiresAt: Date;
};

type Row = Record<string, unknown>;

async function call(pool: pg.Pool, sql: string, params: unknown[]): Promise<Row> {
  try {
    const r = await pool.query(sql, params);
    return r.rows[0] as Row;
  } catch (err) {
    throw parseDbError(err) ?? err;
  }
}

const toResult = (r: Row): LedgerResult => ({
  txnId: (r.txn_id as string | null) ?? null,
  replayed: Boolean(r.replayed),
});

/**
 * Thin, framework-free wrapper over the SQL money functions. All rules live in SQL; this layer only
 * converts types and raises typed `DyceError`s. Kept free of Nest so the DB tests can use it.
 */
export class LedgerRepo {
  constructor(private readonly pool: pg.Pool) {}

  async grantWelcome(userId: string): Promise<LedgerResult> {
    return toResult(await call(this.pool, 'SELECT * FROM grant_welcome($1)', [userId]));
  }

  async transfer(
    from: string,
    to: string,
    amountKobo: number,
    note: string,
    idempotencyKey: string,
  ): Promise<LedgerResult> {
    return toResult(
      await call(this.pool, 'SELECT * FROM transfer($1, $2, $3, $4, $5)', [
        from,
        to,
        amountKobo,
        note,
        idempotencyKey,
      ]),
    );
  }

  async createPaymentRequest(
    requester: string,
    amountKobo: number | null,
    note: string,
    target: string | null,
    ttlMinutes: number,
  ): Promise<PaymentRequest> {
    const r = await call(this.pool, 'SELECT * FROM create_payment_request($1, $2, $3, $4, $5)', [
      requester,
      amountKobo,
      note,
      target,
      ttlMinutes,
    ]);
    return {
      id: r.id as string,
      code: r.code as string,
      requester: r.requester as string,
      amountKobo: r.amount_kobo === null ? null : Number(r.amount_kobo),
      note: r.note as string,
      targetUser: (r.target_user as string | null) ?? null,
      status: r.status as PaymentRequest['status'],
      expiresAt: r.expires_at as Date,
    };
  }

  async payPaymentRequest(
    code: string,
    payer: string,
    amountKobo: number | null,
    idempotencyKey: string,
  ): Promise<LedgerResult> {
    return toResult(
      await call(this.pool, 'SELECT * FROM pay_payment_request($1, $2, $3, $4)', [
        code,
        payer,
        amountKobo,
        idempotencyKey,
      ]),
    );
  }

  async cancelPaymentRequest(code: string, requester: string): Promise<void> {
    await call(this.pool, 'SELECT cancel_payment_request($1, $2)', [code, requester]);
  }

  async stakePool(
    matchId: string,
    userId: string,
    amountKobo: number,
    idempotencyKey: string,
  ): Promise<LedgerResult> {
    return toResult(
      await call(this.pool, 'SELECT * FROM stake_pool($1, $2, $3, $4)', [
        matchId,
        userId,
        amountKobo,
        idempotencyKey,
      ]),
    );
  }

  async settleMatch(matchId: string): Promise<LedgerResult> {
    return toResult(await call(this.pool, 'SELECT * FROM settle_match($1)', [matchId]));
  }

  async refundMatch(matchId: string, reason: 'expired' | 'cancelled'): Promise<LedgerResult> {
    return toResult(await call(this.pool, 'SELECT * FROM refund_match($1, $2)', [matchId, reason]));
  }

  async claimDailyTopup(userId: string): Promise<LedgerResult> {
    return toResult(await call(this.pool, 'SELECT * FROM claim_daily_topup($1)', [userId]));
  }

  /** Nightly job: returns problems found (empty = healthy). With `freeze`, affected users lose Pool access. */
  async checkInvariants(
    freeze = false,
  ): Promise<{ problem: string; ref: string; detail: string }[]> {
    const r = await this.pool.query('SELECT * FROM ledger_check_invariants($1)', [freeze]);
    return r.rows as { problem: string; ref: string; detail: string }[];
  }
}
