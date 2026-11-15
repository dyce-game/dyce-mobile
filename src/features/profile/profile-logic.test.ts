import { MAX_DISPLAY_NAME_LENGTH, REQUEST_POLICIES } from '@dyce/shared';
import {
  POLICY_NOTES,
  POLICY_OPTIONS,
  friendsLabel,
  levelLabel,
  nameProblem,
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
