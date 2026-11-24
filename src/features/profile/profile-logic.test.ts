import { MAX_DISPLAY_NAME_LENGTH, REQUEST_POLICIES } from '@dyce/shared';
import {
  POLICY_NOTES,
  POLICY_OPTIONS,
  friendsLabel,
  levelLabel,
  nameProblem,
  statsFor,
  xpForLevel,
  xpLabel,
  xpProgress,
} from './profile-logic';

describe('request policy options', () => {
  it('cover every policy the server knows, each with a note', () => {
    expect(POLICY_OPTIONS.map((o) => o.key)).toEqual([...REQUEST_POLICIES]);
    for (const p of REQUEST_POLICIES) expect(POLICY_NOTES[p].length).toBeGreaterThan(20);
  });
});

describe('labels', () => {
  it('friendsLabel', () => {
    expect(friendsLabel(0)).toBe('No friends yet');
    expect(friendsLabel(1)).toBe('1 friend');
    expect(friendsLabel(24)).toBe('24 friends');
  });
  it('levelLabel', () => {
    expect(levelLabel(1, 0)).toBe('Level 1 · 0 XP');
    expect(levelLabel(8, 1250)).toContain('Level 8 · 1');
  });
});

describe('nameProblem', () => {
  it('accepts a normal name and trims before checking', () => {
    expect(nameProblem('Ada')).toBeNull();
    expect(nameProblem('  Ada  ')).toBeNull();
  });
  it('rejects blank and over-long names', () => {
    expect(nameProblem('')).toMatch(/name/i);
    expect(nameProblem('   ')).toMatch(/name/i);
    expect(nameProblem('x'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toMatch(/characters/);
    expect(nameProblem('x'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBeNull();
    expect(nameProblem('Nigerian Queen')).toBeNull();
    expect(nameProblem('big.b1tch')).toMatch(/isn't allowed/);
  });
});

describe('XP bar', () => {
  it('a level takes 75 XP per level, as in the design (Level 8 = 600)', () => {
    expect(xpForLevel(1)).toBe(75);
    expect(xpForLevel(8)).toBe(600);
    expect(xpForLevel(0)).toBe(75);
  });
  it('progress is a clamped fraction and the label reads "30 / 600 XP"', () => {
    expect(xpProgress(8, 30)).toBeCloseTo(0.05);
    expect(xpProgress(1, 0)).toBe(0);
    expect(xpProgress(1, 500)).toBe(1);
    expect(xpProgress(1, -5)).toBe(0);
    expect(xpLabel(8, 30)).toBe('30 / 600 XP');
  });
});

describe('profile stats', () => {
  it('reads as a fresh start before any game', () => {
    expect(statsFor(undefined).map((s) => [s.label, s.value])).toEqual([
      ['Games', '0'],
      ['Win rate', '—'],
      ['Pool net', '₦0'],
      ['Best pot', '₦0'],
    ]);
  });
  it('uses real numbers once there are games', () => {
    const p = {
      stats: { games: 8, wins: 5, winRate: 0.625, streak: 2, bestStreak: 3 },
      money: { poolNetKobo: 250_000, bestPotKobo: 400_000 },
    } as Parameters<typeof statsFor>[0];
    expect(statsFor(p).map((s) => s.value)).toEqual(['8', '63%', '₦2,500', '₦4,000']);
  });
});
