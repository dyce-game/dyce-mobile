import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MatchPlayer } from '@dyce/shared';
import { Text } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';

/**
 * The pieces the Word Tiles, Anagrams, Mini Golf and Tanks boards share: the colours of a play table (a fixed
 * dark panel in both themes, as in the designs: the "Dark" files import the light ones), the opponent chip
 * and the glass bar along the bottom with your avatar, the status line and the main button.
 */
export const INK = '#FFFFFF';
export const SOFT = 'rgba(255,255,255,0.78)';
export const GLASS = 'rgba(0,0,0,0.38)';
export const GLASS_EDGE = 'rgba(255,255,255,0.14)';
export const BRASS = '#FFD27A';
export const WARN = '#FFB59E';
export const GOOD = '#7BE3A8';

/** The opponent chip along the top of a table: their avatar and one line about where they are. */
export function PlayerChip({
  player,
  name,
  line,
  style,
}: {
  player: MatchPlayer | null;
  name: string;
  line: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityLabel={line}
      style={[styles.chip, { backgroundColor: GLASS, borderColor: GLASS_EDGE }, style]}
    >
      {player ? <UserAvatar avatar={player.avatar} name={name} size={34} /> : null}
      <Text variant="footnote" color={INK} style={styles.chipText} numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}

/** The glass bar along the bottom: you, what is going on, and the main button (children). */
export function BottomBar({
  me,
  title,
  subtitle,
  subtitleColor = SOFT,
  titleLabel,
  live,
  children,
  style,
}: {
  me: MatchPlayer | null;
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  /** What a screen reader says for the title (defaults to the title). */
  titleLabel?: string;
  /** Announce changes to the subtitle. */
  live?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bar, { backgroundColor: GLASS, borderColor: GLASS_EDGE }, style]}>
      {me ? <UserAvatar avatar={me.avatar} name={me.displayName || me.username} size={42} /> : null}
      <View style={styles.barText}>
        <Text variant="callout" color={INK} numberOfLines={1} accessibilityLabel={titleLabel}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="footnote"
            color={subtitleColor}
            numberOfLines={2}
            accessibilityLiveRegion={live ? 'polite' : 'none'}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 23,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: { flexShrink: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingLeft: 12,
    borderRadius: 30,
    borderWidth: 1,
  },
  barText: { flex: 1, minWidth: 0 },
});
