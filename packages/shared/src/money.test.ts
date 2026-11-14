import { kobo, nairaToKobo, splitKobo, WELCOME_GRANT_KOBO, positiveKoboSchema } from './money.ts';
import { PAYOUT_WEIGHTS, appConfigSchema } from './config.ts';

describe('kobo', () => {
  it('welcome grant is ₦200,000 = 20,000,000 kobo', () => {
    expect(WELCOME_GRANT_KOBO).toBe(20_000_000);
  });
  it('rejects floats and unsafe integers', () => {
    expect(() => kobo(1.5)).toThrow(RangeError);
    expect(() => kobo(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => nairaToKobo(10.5)).toThrow(RangeError);
  });
  it('positive schema rejects zero, negatives and floats', () => {
    expect(positiveKoboSchema.safeParse(0).success).toBe(false);
    expect(positiveKoboSchema.safeParse(-5).success).toBe(false);
    expect(positiveKoboSchema.safeParse(1.5).success).toBe(false);
    expect(positiveKoboSchema.safeParse(100).success).toBe(true);
  });
});

describe('splitKobo (payout rounding)', () => {
  it('50/30/20 of an even pot', () => {
    expect(splitKobo(kobo(1_000_00), PAYOUT_WEIGHTS.p50_30_20)).toEqual([50_000, 30_000, 20_000]);
  });
  it('remainder goes to first place and the total is conserved', () => {
    const shares = splitKobo(kobo(101), PAYOUT_WEIGHTS.p50_30_20);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(101);
    // floors: 50, 30, 20 → 100; remainder 1 → first place
    expect(shares).toEqual([51, 30, 20]);
  });
  it('winner takes all', () => {
    expect(splitKobo(kobo(777), PAYOUT_WEIGHTS.winner_all)).toEqual([777]);
  });
  it('conserves the pot for arbitrary totals', () => {
    for (let total = 0; total < 500; total++) {
      for (const w of Object.values(PAYOUT_WEIGHTS)) {
        const shares = splitKobo(kobo(total), w);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});

describe('app config', () => {
  it('provides defaults matching WALLET_AND_QR.md', () => {
    const cfg = appConfigSchema.parse({});
    expect(cfg.send_limit_kobo).toBe(5_000_000);
    expect(cfg.send_daily_limit_kobo).toBe(20_000_000);
    expect(cfg.topup_threshold_kobo).toBe(1_000_000);
    expect(cfg.topup_amount_kobo).toBe(2_000_000);
  });
});
