import { badgeDetail } from './badge-logic';

describe('badge detail', () => {
  it('says locked until it is earned', () => {
    expect(badgeDetail({ earnedAt: null })).toEqual({
      unlocked: false,
      status: 'Locked · not earned yet',
    });
  });

  it('says when it was unlocked', () => {
    const d = badgeDetail({ earnedAt: new Date(2026, 10, 5, 12).toISOString() });
    expect(d.unlocked).toBe(true);
    expect(d.status).toBe('Unlocked · 5 Nov 2026');
  });
});
