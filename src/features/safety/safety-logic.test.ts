import { blockedLabel, REPORT_REASON_LIST } from './safety-logic';
import { REPORT_REASONS } from '@dyce/shared';

describe('blockedLabel', () => {
  const now = new Date(2026, 10, 15, 15);
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).toISOString();
  it('says today, yesterday, or the date', () => {
    expect(blockedLabel(at(2026, 11, 15), now)).toBe('Blocked today');
    expect(blockedLabel(at(2026, 11, 14), now)).toBe('Blocked yesterday');
    expect(blockedLabel(at(2026, 10, 30), now)).toBe('Blocked Oct 30');
    expect(blockedLabel(at(2025, 3, 2), now)).toBe('Blocked Mar 2, 2025');
  });
});

describe('report reasons', () => {
  it('offers exactly the reasons the server accepts, once each', () => {
    expect(REPORT_REASON_LIST.map((r) => r.id).sort()).toEqual([...REPORT_REASONS].sort());
    expect(new Set(REPORT_REASON_LIST.map((r) => r.id)).size).toBe(REPORT_REASON_LIST.length);
  });
});

describe('reportHref', () => {
  it('carries what the Report screen needs, encoded, and leaves out what is missing', async () => {
    const { reportHref } = await import('./safety-logic');
    expect(
      reportHref({ userId: 'u1', username: 'ada.o', name: 'Ada Obi & Co', conversationId: 'c1' }),
    ).toBe('/report?userId=u1&username=ada.o&name=Ada%20Obi%20%26%20Co&conversationId=c1');
    expect(reportHref({ userId: 'u1', name: '' })).toBe('/report?userId=u1');
  });
});
