import { Pressable, StyleSheet, View } from 'react-native';
import type { SpaceView } from '@dyce/shared';
import { MIN_TOUCH, Text } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import type { SeatNote } from '../common-logic';
import { GLASS, ON } from './PartyChrome';

export type SeatTag = { text: string; bg: string; fg?: string };
export type SeatBubble = { text: string; bg?: string; fg?: string };

export type SeatProps = {
  name: string;
  avatar?: SpaceView['members'][number]['avatar'];
  size?: number;
  /** Ring colour around the avatar (brass = their turn, ember = chosen, ...). */
  ring?: string;
  /** A small label under the avatar (a role, "OUT", "VOTE"). Always words, never colour alone. */
  tag?: SeatTag | null;
  /** A speech bubble above the avatar (a clue, a guess). */
  bubble?: SeatBubble | null;
  /** A line under the name ("3 votes", "420 pts"). */
  caption?: string | null;
  note?: SeatNote;
  dim?: boolean;
  selected?: boolean;
  /** Makes the seat a button (pick a suspect, a victim, a guesser). */
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  /** Width of the whole seat; the name never gets wider than this. */
  width?: number;
};

/** One person at the table: avatar with a ring, name, an optional bubble above and tag below. */
export function Seat({
  name,
  avatar,
  size = 48,
  ring = 'rgba(255,255,255,0.4)',
  tag,
  bubble,
  caption,
  note,
  dim,
  selected,
  onPress,
  disabled,
  accessibilityLabel,
  width = 84,
}: SeatProps) {
  const body = (
    <View style={[styles.seat, { width, opacity: dim ? 0.55 : 1 }]}>
      {bubble ? (
        <View style={[styles.bubble, { backgroundColor: bubble.bg ?? 'rgba(255,255,255,0.92)' }]}>
          <Text
            variant="footnote"
            numberOfLines={1}
            style={{ color: bubble.fg ?? '#1B140F', fontFamily: 'Figtree_800ExtraBold' }}
          >
            {bubble.text}
          </Text>
        </View>
      ) : null}
      <View style={[styles.ring, { borderColor: ring, borderRadius: (size + 8) / 2 }]}>
        <UserAvatar avatar={avatar} name={name} size={size} />
      </View>
      <Text variant="footnote" numberOfLines={1} style={[styles.name, { maxWidth: width }]}>
        {name}
      </Text>
      {tag ? (
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <Text variant="caption" style={{ color: tag.fg ?? ON }}>
            {tag.text}
          </Text>
        </View>
      ) : null}
      {caption ? (
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {caption}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" style={{ color: '#FFD27A' }}>
          {note === 'left' ? 'Left' : 'Offline'}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH }}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seat: { alignItems: 'center', gap: 3 },
  ring: { borderWidth: 3, padding: 1 },
  bubble: {
    maxWidth: 96,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 11,
    marginBottom: 1,
  },
  name: {
    color: ON,
    textAlign: 'center',
    backgroundColor: GLASS,
    borderRadius: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
});
