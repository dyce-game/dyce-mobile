import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_NAMES, GAME_RULES, GAME_SLUGS, poolRulesLine, rulesFor } from './rules';

/** docs/GAMES.md: the 23 games and their Pool minimum in naira. */
const CATALOGUE: Record<string, number> = {
  'cup-pong': 100,
  'eight-ball': 200,
  darts: 200,
  basketball: 200,
  archery: 100,
  'mini-golf': 100,
  tanks: 100,
  'sea-battle': 500,
  chess: 500,
  checkers: 200,
  ayo: 200,
  ludo: 500,
  'dots-and-boxes': 100,
  'word-tiles': 200,
  'word-hunt': 200,
  anagrams: 100,
  filler: 100,
  'crazy-cards': 200,
  whot: 200,
  charades: 200,
  imposter: 300,
  werewolf: 500,
  'doodle-guess': 100,
};

describe('the rules sheet copy', () => {
  it('covers all 23 games of docs/GAMES.md, and Pig for dev builds', () => {
    expect([...GAME_SLUGS].filter((s) => s !== '_example').sort()).toEqual(
      Object.keys(CATALOGUE).sort(),
    );
    expect(GAME_SLUGS).toContain('_example');
  });

  it.each(GAME_SLUGS)('%s has three bullets, a name and a Pool line', (slug) => {
    const r = GAME_RULES[slug];
    expect(r.how).toHaveLength(3);
    for (const line of r.how) expect(line.trim().length).toBeGreaterThan(15);
    expect(r.pool.trim().length).toBeGreaterThan(0);
    expect(GAME_NAMES[slug].length).toBeGreaterThan(0);
  });

  it('carries the Pool minimum from docs/GAMES.md (kobo)', () => {
    for (const [slug, naira] of Object.entries(CATALOGUE)) {
      expect(rulesFor(slug)?.poolMinKobo).toBe(naira * 100);
    }
    expect(rulesFor('_example')?.poolMinKobo).toBeNull();
  });

  it('never uses a trademarked name (Uno, Scrabble)', () => {
    const all = JSON.stringify([GAME_RULES, GAME_NAMES]);
    expect(all).not.toMatch(/\buno\b/i);
    expect(all).not.toMatch(/scrabble/i);
  });

  it('knows nothing about a slug it was never given', () => {
    expect(rulesFor('hopscotch')).toBeNull();
  });
});

describe('poolRulesLine', () => {
  it('adds the minimum stake, and prefers the one the server sent', () => {
    const chess = rulesFor('chess')!;
    expect(poolRulesLine(chess)).toMatch(/Minimum stake Ð500\.$/);
    expect(poolRulesLine(chess, 100_000)).toMatch(/Minimum stake Ð1,000\.$/);
    expect(poolRulesLine(rulesFor('_example')!)).toBe('Not available.');
  });
});

describe('the registry files', () => {
  const dir = join(__dirname, 'entries');
  const files = readdirSync(dir);
  const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');

  it('has one entry file per slug, registered in index.ts, with the matching slug inside', () => {
    expect(files.sort()).toEqual(GAME_SLUGS.map((s) => `${s}.ts`).sort());
    for (const slug of GAME_SLUGS) {
      expect(index).toContain(`'./entries/${slug}'`);
      expect(readFileSync(join(dir, `${slug}.ts`), 'utf8')).toMatch(new RegExp(`slug: '${slug}'`));
    }
  });

  it('gives each game that is already built a board, a picture and a view parser', () => {
    for (const slug of ['_example', 'word-hunt', 'cup-pong']) {
      const src = readFileSync(join(dir, `${slug}.ts`), 'utf8');
      expect(src).toMatch(/Board:/);
      expect(src).toMatch(/Art:/);
      expect(src).toMatch(/parseView:/);
    }
  });
});
