import { MAX_DISPLAY_NAME_LENGTH, REQUEST_POLICIES } from '@dyce/shared';
import {
  BADGE_PREVIEW,
  POLICY_NOTES,
  POLICY_OPTIONS,
  friendsLabel,
  levelLabel,
  nameProblem,
  profileStats,
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

describe('profile stats and badges', () => {
  it('shows four stat cards and five locked badges', () => {
    expect(profileStats().map((s) => s.label)).toEqual([
      'Games',
      'Win rate',
      'Pool net',
      'Best pot',
    ]);
    expect(BADGE_PREVIEW).toHaveLength(5);
    expect(new Set(BADGE_PREVIEW.map((b) => b.key)).size).toBe(5);
  });
});
