import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { AvatarConfig } from '@dyce/shared';
import { Icon, MAX_FONT_SCALE, Text, brand, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';

export type PickableFriend = {
  id: string;
  username: string;
  displayName: string;
  avatar: AvatarConfig | null;
};

/**
 * The people-picker of New group and Add members (design: NewGroup): the chosen people as removable chips,
 * a search field, and a list of friends with a check circle. Only friends can be added to a group, so
 * that is all this lists.
 */
export function FriendPicker({
  friends,
  selected,
  onToggle,
  query,
  onQuery,
  empty,
}: {
  friends: PickableFriend[];
  selected: string[];
  onToggle: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  /** Shown when `friends` has nobody to pick. */
  empty: string;
}) {
  const { colors } = useTheme();
  const chosen = friends.filter((f) => selected.includes(f.id));
  const q = query.trim().toLowerCase();
  const shown = q
    ? friends.filter(
        (f) => f.username.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q),
      )
    : friends;

  return (
    <View style={styles.wrap}>
      {chosen.length > 0 ? (
        <View style={styles.chosen} accessibilityLabel={`${chosen.length} selected`}>
          {chosen.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.displayName || f.username}`}
              onPress={() => onToggle(f.id)}
              style={styles.chip}
            >
              <UserAvatar avatar={f.avatar} name={f.displayName || f.username} size={48} />
              <View style={[styles.x, { backgroundColor: colors.sub }]} aria-hidden>
                <Text style={[styles.xText, { color: colors.bg }]}>×</Text>
              </View>
              <Text numberOfLines={1} style={styles.chipName}>
                {(f.displayName || f.username).split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.search, { backgroundColor: colors.chip }]}>
        <Icon name="search" size={17} color={colors.sub} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search friends"
          placeholderTextColor={colors.sub}
          accessibilityLabel="Search friends"
          autoCapitalize="none"
          autoCorrect={false}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.input, { color: colors.text }]}
        />
      </View>

      <Text variant="caption" color="sub" accessibilityRole="header" style={styles.section}>
        On Dyce
      </Text>
      {friends.length === 0 ? (
        <Text color="sub">{empty}</Text>
      ) : shown.length === 0 ? (
        <Text color="sub">No friends match “{query.trim()}”.</Text>
      ) : null}
      {shown.map((f) => {
        const on = selected.includes(f.id);
        const name = f.displayName || f.username;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`${name}, @${f.username}`}
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(f.id)}
            style={[styles.row, { borderColor: colors.line }]}
          >
            <UserAvatar avatar={f.avatar} name={name} size={40} />
            <View style={styles.names}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text color="sub" style={styles.handle} numberOfLines={1}>
                @{f.username}
              </Text>
            </View>
            <View
              aria-hidden
              style={[
                styles.check,
                {
                  borderColor: on ? brand.ember.fill : colors.line,
                  backgroundColor: on ? brand.ember.fill : 'transparent',
                },
              ]}
            >
              {on ? (
                <Icon name="check" size={13} color={brand.ember.text} strokeWidth={3.2} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  chosen: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 6 },
  chip: { width: 60, minHeight: 44, alignItems: 'center', gap: 4 },
  x: {
    position: 'absolute',
    right: 2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xText: { fontSize: 13, lineHeight: 16, fontFamily: 'Figtree_800ExtraBold' },
  chipName: { fontSize: 11, maxWidth: 58 },
  search: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, fontSize: 16, fontFamily: 'Figtree_500Medium', paddingVertical: 8 },
  section: { marginTop: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    borderBottomWidth: 1,
  },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  handle: { fontSize: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
