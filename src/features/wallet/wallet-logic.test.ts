import type { HistoryItem } from '@dyce/shared';
import {
  expiryLabel,
  groupByDay,
  historyTitle,
  newMoneyKey,
  parseNairaInput,
  parseRequestCode,
  requestUrl,
} from './wallet-logic';

describe('parseNairaInput', () => {
  it('reads whole naira in the ways people type them', () => {
    expect(parseNairaInput('1500')).toBe(150_000);
    expect(parseNairaInput('1,500')).toBe(150_000);
    expect(parseNairaInput(' ₦ 2,000 ')).toBe(200_000);
    expect(parseNairaInput('5000.')).toBe(500_000);
  });
  it('refuses empty, zero, decimals, letters and absurd lengths', () => {
    for (const bad of ['', '0', '000', '12.50', 'abc', '12a', '-5', '1234567890', '₦']) {
      expect(parseNairaInput(bad)).toBeNull();
    }
  });
});

describe('parseRequestCode', () => {
  it('accepts the bare code and our links, case-insensitively', () => {
    expect(parseRequestCode('abcdefg234')).toBe('ABCDEFG234');
    expect(parseRequestCode('https://dyce.games/r/ABCDEFG234')).toBe('ABCDEFG234');
    expect(parseRequestCode('https://www.dyce.games/r/abcdefg234/')).toBe('ABCDEFG234');
    expect(parseRequestCode('dyce://r/ABCDEFG234')).toBe('ABCDEFG234');
    expect(parseRequestCode('  https://dyce.games/r/ABCDEFG234?utm=x  ')).toBe('ABCDEFG234');
  });
  it('rejects other sites, other paths, bad characters and wrong lengths', () => {
    for (const bad of [
      'https://evil.example/r/ABCDEFG234',
      'https://dyce.games.evil.example/r/ABCDEFG234',
      'https://dyce.games/u/ada.o',
      'https://dyce.games/r/ABCDEFG23',
      'https://dyce.games/r/ABCDEFG2341',
      'ABCDEFG231', // 1 is not base32
      'hello',
      '',
    ]) {
      expect(parseRequestCode(bad)).toBeNull();
    }
  });
  it('round-trips with requestUrl', () => {
    expect(parseRequestCode(requestUrl('ABCDEFG234'))).toBe('ABCDEFG234');
  });
});

describe('expiryLabel', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
  it('counts down in the unit that reads best', () => {
    expect(expiryLabel(at(14 * 60_000 + 10_000), now)).toBe('Expires in 15 min');
    expect(expiryLabel(at(60_000), now)).toBe('Expires in 1 min');
    expect(expiryLabel(at(3 * 3_600_000), now)).toBe('Expires in 3 hours');
    expect(expiryLabel(at(3_600_000), now)).toBe('Expires in 1 hour');
    expect(expiryLabel(at(6.5 * 86_400_000), now)).toBe('Expires in 6 days');
  });
  it('says Expired at and after the deadline', () => {
    expect(expiryLabel(at(0), now)).toBe('Expired');
    expect(expiryLabel(at(-5_000), now)).toBe('Expired');
  });
});

describe('newMoneyKey', () => {
  it('is prefixed, unique and acceptable to the server', () => {
    const a = newMoneyKey('send');
    expect(a).toMatch(/^send-[0-9a-f-]{36}$/);
    expect(newMoneyKey('pay')).not.toBe(newMoneyKey('pay'));
    expect(a.length).toBeLessThanOrEqual(80);
    expect(a).toMatch(/^[A-Za-z0-9_:.-]+$/);
  });
});

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: 'i',
  kind: 'transfer',
  amountKobo: -100,
  createdAt: new Date(2026, 10, 15, 12).toISOString(),
  counterparty: { id: 'p', username: 'bayo_spins', displayName: 'Bayo Spins' },
  note: '',
  requestCode: null,
  ...over,
});

describe('historyTitle', () => {
  it('says who in words', () => {
    expect(historyTitle(item({}))).toBe('Sent to Bayo Spins');
    expect(historyTitle(item({ amountKobo: 100 }))).toBe('Received from Bayo Spins');
    expect(historyTitle(item({ kind: 'request_payment' }))).toBe('Paid Bayo Spins');
    expect(historyTitle(item({ kind: 'request_payment', amountKobo: 100 }))).toBe(
      'Bayo Spins paid you',
    );
    expect(historyTitle(item({ kind: 'grant', counterparty: null, amountKobo: 100 }))).toBe(
      'Dyce welcome gift',
    );
    expect(historyTitle(item({ kind: 'topup', counterparty: null, amountKobo: 100 }))).toBe(
      'Daily top-up',
    );
    expect(historyTitle(item({ kind: 'payout', counterparty: null, amountKobo: 100 }))).toBe(
      'Pool winnings',
    );
  });
  it('falls back to the username when there is no display name', () => {
    expect(
      historyTitle(item({ counterparty: { id: 'p', username: 'tunde.o', displayName: '' } })),
    ).toBe('Sent to @tunde.o');
  });
});

describe('groupByDay', () => {
  it('groups neighbouring rows under one day heading', () => {
    const now = new Date(2026, 10, 15, 15);
    const groups = groupByDay(
      [
        item({ id: 'a', createdAt: new Date(2026, 10, 15, 14).toISOString() }),
        item({ id: 'b', createdAt: new Date(2026, 10, 15, 9).toISOString() }),
        item({ id: 'c', createdAt: new Date(2026, 10, 14, 20).toISOString() }),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('initials and tiles', () => {
  it('takes up to two letters from a name or a handle', async () => {
    const { initials, historyTile } = await import('./wallet-logic');
    expect(initials('Amaka Obi')).toBe('AO');
    expect(initials('tunde.o')).toBe('TO');
    expect(initials('@bayo_spins')).toBe('BS');
    expect(initials('Ngozi')).toBe('N');
    expect(initials('')).toBe('?');
    expect(
      historyTile({
        kind: 'transfer',
        counterparty: { id: 'p', username: 'a', displayName: 'Amaka Obi' },
      }),
    ).toEqual({
      mark: 'AO',
      bg: '#C93E1C',
    });
    expect(historyTile({ kind: 'grant', counterparty: null })).toEqual({
      mark: '₦',
      bg: '#C93E1C',
    });
    expect(historyTile({ kind: 'payout', counterparty: null }).mark).toBe('P');
  });
});

describe('week bars', () => {
  it('scales to the biggest day, marks losses, and keeps quiet days as slivers', async () => {
    const { weekBars, weekdayLetter } = await import('./wallet-logic');
    const bars = weekBars([
      { date: '2026-11-09', netKobo: 0 },
      { date: '2026-11-10', netKobo: -50_000 },
      { date: '2026-11-11', netKobo: 100_000 },
      { date: '2026-11-12', netKobo: 1 },
    ]);
    expect(bars.map((b) => b.pct)).toEqual([4, 35, 70, 8]);
    expect(bars.map((b) => b.loss)).toEqual([false, true, false, false]);
    expect(bars.map((b) => b.letter).join('')).toBe('MTWT');
    expect(weekdayLetter('2026-11-15')).toBe('S');
    expect(weekBars([])).toEqual([]);
  });
});

describe('keypadPress', () => {
  it('builds an amount like the design keypad, with delete and a cap', async () => {
    const { keypadPress } = await import('./wallet-logic');
    expect(keypadPress('0', '5', 200_000)).toBe('5');
    expect(keypadPress('5', '00', 200_000)).toBe('500');
    expect(keypadPress('500', '0', 200_000)).toBe('5000');
    expect(keypadPress('5000', 'del', 200_000)).toBe('500');
    expect(keypadPress('5', 'del', 200_000)).toBe('0');
    expect(keypadPress('0', 'del', 200_000)).toBe('0');
    expect(keypadPress('0', '00', 200_000)).toBe('0');
    expect(keypadPress('190000', '0', 200_000)).toBe('200000');
    expect(keypadPress('0', '7', 200_000)).toBe('7');
  });
});
