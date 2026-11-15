import { AVATAR_PRESET_COUNT, avatarConfigSchema } from '@dyce/shared';
import {
  HAIR_FILTERS,
  SKIN_FILTERS,
  STARTER_LOOKS,
  filterLooks,
  imageFor,
  lookById,
  randomLook,
} from './starter-logic';

describe('the starter looks', () => {
  it('are the 220 profiles, each a valid saved avatar and each with a picture', () => {
    expect(STARTER_LOOKS).toHaveLength(AVATAR_PRESET_COUNT);
    expect(new Set(STARTER_LOOKS.map((l) => l.id)).size).toBe(AVATAR_PRESET_COUNT);
    for (const l of STARTER_LOOKS) {
      expect(avatarConfigSchema.safeParse({ v: 1, preset: l.id }).success).toBe(true);
      expect(imageFor({ v: 1, preset: l.id })).toBeTruthy();
      expect(l.label.length).toBeGreaterThan(3);
    }
  });

  it('every filter chip has looks behind it', () => {
    for (const s of SKIN_FILTERS)
      expect(filterLooks({ skin: s.key, hair: null }).length).toBeGreaterThan(0);
    for (const h of HAIR_FILTERS)
      expect(filterLooks({ skin: null, hair: h.key }).length).toBeGreaterThan(0);
  });
});

describe('filterLooks', () => {
  it('returns everything with no filter, and narrows with each one', () => {
    expect(filterLooks({ skin: null, hair: null })).toHaveLength(AVATAR_PRESET_COUNT);
    const deep = filterLooks({ skin: 'deep', hair: null });
    expect(deep.every((l) => l.skin === 'deep')).toBe(true);
    const deepAfro = filterLooks({ skin: 'deep', hair: 'afro' });
    expect(deepAfro.length).toBeLessThanOrEqual(deep.length);
    expect(deepAfro.every((l) => l.skin === 'deep' && l.hair === 'afro')).toBe(true);
  });

  it('can come back empty (the screen then offers to clear the filters)', () => {
    expect(filterLooks({ skin: 'deep', hair: 'afro' }, [])).toEqual([]);
  });
});

describe('randomLook', () => {
  const three = STARTER_LOOKS.slice(0, 3);
  it('never repeats the current look when there is a choice', () => {
    for (let i = 0; i < 20; i++) {
      expect(randomLook(three, three[0]!.id, () => i / 20)?.id).not.toBe(three[0]!.id);
    }
  });
  it('handles one look and none', () => {
    expect(randomLook([three[0]!], three[0]!.id)?.id).toBe(three[0]!.id);
    expect(randomLook([], null)).toBeNull();
  });
  it('never indexes past the end for a random value of 1', () => {
    expect(randomLook(three, null, () => 1)?.id).toBe(three[2]!.id);
  });
});

describe('imageFor and lookById', () => {
  it('give nothing for no avatar or an unknown look (the initial is shown instead)', () => {
    expect(imageFor(null)).toBeNull();
    expect(imageFor(undefined)).toBeNull();
    expect(imageFor({ v: 1, preset: 'dyce_av_999' })).toBeNull();
    expect(lookById('nope')).toBeNull();
    expect(lookById(null)).toBeNull();
    expect(lookById('dyce_av_001')?.id).toBe('dyce_av_001');
  });
});
