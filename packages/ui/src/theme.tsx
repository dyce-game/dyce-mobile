import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { colors, type ThemeColors, type ThemeName } from './tokens.ts';

export type Theme = { name: ThemeName; isDark: boolean; colors: ThemeColors };

const ThemeContext = createContext<Theme | null>(null);

/**
 * Theme follows the device (useColorScheme). There is intentionally no in-app toggle (CLAUDE.md).
 * `forceTheme` exists only for the dev gallery and tests.
 */
export function ThemeProvider({
  children,
  forceTheme,
}: {
  children: ReactNode;
  forceTheme?: ThemeName;
}) {
  const scheme = useColorScheme();
  const name: ThemeName = forceTheme ?? (scheme === 'dark' ? 'dark' : 'light');
  const value = useMemo<Theme>(
    () => ({ name, isDark: name === 'dark', colors: colors[name] }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}
