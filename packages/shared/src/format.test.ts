import { formatNaira } from './format.ts';
import { nairaToKobo, kobo } from './money.ts';

const n = nairaToKobo;

describe('formatNaira compact', () => {
  const table: [number, string][] = [
    [0, '₦0'],
    [950, '₦950'],
    [1_500, '₦1,500'],
    [9_999, '₦9,999'],
    [10_000, '₦10k'],
    [12_500, '₦12.5k'],
    [12_550, '₦12.5k'], // truncated, never overstated
    [200_000, '₦200k'],
    [999_999, '₦999.9k'],
    [1_000_000, '₦1m'],
    [1_200_000, '₦1.2m'],
    [25_000_000, '₦25m'],
  ];
  it.each(table)('₦%i → %s', (naira, expected) => {
    expect(formatNaira(n(naira), { compact: true })).toBe(expected);
  });

  it('formats negatives with a leading minus', () => {
    expect(formatNaira(n(-12_500), { compact: true })).toBe('-₦12.5k');
  });

  it('ignores sub-naira kobo in compact mode', () => {
    expect(formatNaira(kobo(150_099), { compact: true })).toBe('₦1,500');
  });
});

describe('formatNaira full', () => {
  it('starting grant', () => {
    expect(formatNaira(n(200_000))).toBe('₦200,000');
  });
  it('thousands separators', () => {
    expect(formatNaira(n(1_234_567))).toBe('₦1,234,567');
  });
  it('shows kobo only when non-zero', () => {
    expect(formatNaira(kobo(150_050))).toBe('₦1,500.50');
    expect(formatNaira(kobo(150_005))).toBe('₦1,500.05');
    expect(formatNaira(kobo(150_000))).toBe('₦1,500');
  });
  it('zero', () => {
    expect(formatNaira(kobo(0))).toBe('₦0');
  });
});
