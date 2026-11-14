import { brand, colors, type ThemeName } from './tokens.ts';
import { contrastRatio } from './contrast.ts';

const themes: ThemeName[] = ['light', 'dark'];

describe('colour tokens match docs/DESIGN_SYSTEM.md', () => {
  it('light and dark surfaces', () => {
    expect(colors.light.bg).toBe('#FBF8F3');
    expect(colors.dark.bg).toBe('#0F0D0B');
    expect(colors.dark.bg).not.toBe('#000000'); // dark is warm black, never pure black
    expect(colors.light.accent).toBe('#B33416');
    expect(colors.dark.accent).toBe('#FF8F6B');
  });
  it('brand colours', () => {
    expect(brand.ember.fill).toBe('#C93E1C');
    expect(brand.brass.edge).toBe('#A86F12');
    expect(brand.felt.fill).toBe('#17834F');
    expect(brand.sms.fill).toBe('#0A66D1');
  });
});

describe('accessibility: text contrast (WCAG AA 4.5:1 for normal text)', () => {
  it.each(themes)('%s: primary and secondary text on background and card', (t) => {
    const c = colors[t];
    expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.sub, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.sub, c.card)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(themes)('%s: accent text on background and card', (t) => {
    const c = colors[t];
    expect(contrastRatio(c.accent, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.accent, c.card)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(themes)('%s: money text on background', (t) => {
    const c = colors[t];
    expect(contrastRatio(c.money, c.bg)).toBeGreaterThanOrEqual(3); // large/bold amounts
  });
  it.each(Object.keys(brand).filter((k) => k !== 'online'))('brand %s: label on its fill', (k) => {
    const b = brand[k as keyof typeof brand] as { fill: string; text: string };
    expect(contrastRatio(b.text, b.fill)).toBeGreaterThanOrEqual(4.5);
  });
});
