import type { ImageSourcePropType } from 'react-native';
import type { AvatarConfig } from '@dyce/shared';
import { STARTER_IMAGES } from './starter-images';
import { STARTER_LOOKS, type HairType, type SkinTone, type StarterLook } from './starter-looks';

export { STARTER_LOOKS };
export type { HairType, SkinTone, StarterLook };

/** The skin-tone filter chips on the picker, in order, with a swatch colour for each. */
export const SKIN_FILTERS: { key: SkinTone; label: string; swatch: string }[] = [
  { key: 'light', label: 'Light', swatch: '#F1C27D' },
  { key: 'tan', label: 'Tan', swatch: '#C68642' },
  { key: 'brown', label: 'Brown', swatch: '#8D5524' },
  { key: 'deep', label: 'Deep', swatch: '#5C3A21' },
];

export const HAIR_FILTERS: { key: HairType; label: string }[] = [
  { key: 'afro', label: 'Afro & coily' },
  { key: 'braids', label: 'Braids & locs' },
  { key: 'straight', label: 'Straight & short' },
  { key: 'bald', label: 'Bald' },
  { key: 'covered', label: 'Covered' },
];

export type LookFilter = { skin: SkinTone | null; hair: HairType | null };

/** The looks that match both filters (a null filter matches everything). Order is stable. */
export function filterLooks(
  filter: LookFilter,
  looks: StarterLook[] = STARTER_LOOKS,
): StarterLook[] {
  return looks.filter(
    (l) =>
      (filter.skin === null || l.skin === filter.skin) &&
      (filter.hair === null || l.hair === filter.hair),
  );
}

/** A random look from `looks`, never the one already `current` when there is another to pick. */
export function randomLook(
  looks: StarterLook[],
  current: string | null,
  random: () => number = Math.random,
): StarterLook | null {
  const pool = looks.length > 1 ? looks.filter((l) => l.id !== current) : looks;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
}

/** The picture for a saved avatar, or null (show the initial) when there is none or it is unknown. */
export function imageFor(avatar: AvatarConfig | null | undefined): ImageSourcePropType | null {
  return avatar ? (STARTER_IMAGES[avatar.preset] ?? null) : null;
}

export function lookById(id: string | null | undefined): StarterLook | null {
  return STARTER_LOOKS.find((l) => l.id === id) ?? null;
}
