/**
 * "Tabletop" design tokens. Source: docs/DESIGN_SYSTEM.md. Dark is warm black, never #000.
 * Pure data (no React Native imports) so it is testable in Node.
 */
export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  bg: string;
  card: string;
  chip: string;
  chipEdge: string;
  line: string;
  text: string;
  sub: string;
  accent: string;
  brandSoft: string;
  money: string;
  glass: string;
  glassEdge: string;
  glassShadow: string;
};

export const colors: Record<ThemeName, ThemeColors> = {
  light: {
    bg: '#FBF8F3',
    card: '#FFFFFF',
    chip: '#EEE7DC',
    chipEdge: '#D8CEC1',
    line: '#E6DDD0',
    text: '#1B140F',
    sub: '#6F655B',
    accent: '#B33416',
    brandSoft: '#FBE7DF',
    money: '#17834F',
    glass: 'rgba(255,255,255,0.62)',
    glassEdge: 'rgba(255,255,255,0.90)',
    glassShadow: 'rgba(90,40,10,0.12)',
  },
  dark: {
    bg: '#0F0D0B',
    card: '#1D1916',
    chip: '#2A2420',
    chipEdge: '#15120F',
    line: '#2E2823',
    text: '#F7F1E8',
    sub: '#ABA196',
    accent: '#FF8F6B',
    brandSoft: '#3A170C',
    money: '#3DDC84',
    glass: 'rgba(42,36,32,0.60)',
    glassEdge: 'rgba(255,255,255,0.10)',
    glassShadow: 'rgba(0,0,0,0.45)',
  },
};

/** Fixed brand colours, identical in both themes. `edge` is the solid bottom edge of a token button. */
export const brand = {
  ember: { fill: '#C93E1C', edge: '#8A2410', text: '#FFFFFF' }, // Dyce, primary, POOL, Dyce bubbles
  brass: { fill: '#E3A93B', edge: '#A86F12', text: '#3A2400' }, // coins, pots, YOUR TURN
  felt: { fill: '#17834F', edge: '#0C5A34', text: '#FFFFFF' }, // FREE
  sms: { fill: '#0A66D1', edge: '#064A99', text: '#FFFFFF' }, // SMS bubbles and tags
  bot: { fill: '#5A4FCF', edge: '#3B3299', text: '#FFFFFF' }, // bots (edge derived)
  online: '#2BB673',
} as const;

export type BrandName = Exclude<keyof typeof brand, 'online'>;

export const radii = {
  chip: 16,
  button: 24, // buttons are pills in the 21-27 range
  card: 22,
  sheetTop: 28,
  tile: 16,
} as const;

/** Type scale. Display/Title use Bricolage Grotesque; the rest use Figtree. */
export const type = {
  display: { fontSize: 38, fontWeight: '800', letterSpacing: -1, family: 'display' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, family: 'display' },
  headline: { fontSize: 20, fontWeight: '800', letterSpacing: 0, family: 'body' },
  body: { fontSize: 16, fontWeight: '500', letterSpacing: 0, family: 'body' },
  callout: { fontSize: 15, fontWeight: '700', letterSpacing: 0, family: 'body' },
  footnote: { fontSize: 13, fontWeight: '600', letterSpacing: 0, family: 'body' },
  caption: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, family: 'body', uppercase: true },
} as const;

export type TypeToken = keyof typeof type;

/** Dynamic Type is respected up to this multiplier (CLAUDE.md accessibility rule). */
export const MAX_FONT_SCALE = 1.3;

/** Minimum touch target in points (CLAUDE.md accessibility rule). */
export const MIN_TOUCH = 44;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Spring defaults and durations (DESIGN_SYSTEM.md "Motion"). */
export const motion = {
  spring: { damping: 18, stiffness: 220 },
  sheetMs: 280,
  pressMs: 90,
} as const;

/** TabBar geometry (DESIGN_SYSTEM.md): 68pt tall, 26pt from the bottom. */
export const tabBar = { height: 68, bottomOffset: 26, searchSize: 68 } as const;
