import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme.tsx';
import { MAX_FONT_SCALE, type, type ThemeColors, type TypeToken } from '../tokens.ts';

export type TextColor =
  keyof Pick<ThemeColors, 'text' | 'sub' | 'accent' | 'money'> | (string & {});

export type DyceTextProps = RNTextProps & {
  variant?: TypeToken;
  color?: TextColor;
};

const FIGTREE: Record<string, string> = {
  '400': 'Figtree_400Regular',
  '500': 'Figtree_500Medium',
  '600': 'Figtree_600SemiBold',
  '700': 'Figtree_700Bold',
  '800': 'Figtree_800ExtraBold',
};
const BRICOLAGE: Record<string, string> = {
  '600': 'BricolageGrotesque_600SemiBold',
  '700': 'BricolageGrotesque_700Bold',
  '800': 'BricolageGrotesque_800ExtraBold',
};

type Token = (typeof type)[TypeToken];

export function fontFamilyFor(token: Token): string {
  const weight = String(token.fontWeight);
  return token.family === 'display'
    ? (BRICOLAGE[weight] ?? 'BricolageGrotesque_800ExtraBold')
    : (FIGTREE[weight] ?? 'Figtree_500Medium');
}

/** Typography primitive. Respects Dynamic Type up to 1.3x; never use raw RN <Text> in features. */
export function Text({
  variant = 'body',
  color = 'text',
  style,
  children,
  ...rest
}: DyceTextProps) {
  const { colors } = useTheme();
  const token = type[variant];
  const resolved = (colors as Record<string, string>)[color] ?? color;
  const base: TextStyle = {
    fontFamily: fontFamilyFor(token),
    fontSize: token.fontSize,
    letterSpacing: token.letterSpacing,
    color: resolved,
    ...('uppercase' in token && token.uppercase ? { textTransform: 'uppercase' as const } : null),
  };
  return (
    <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} style={[base, style]} {...rest}>
      {children}
    </RNText>
  );
}
