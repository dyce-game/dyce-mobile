import { Pressable, StyleSheet, View } from 'react-native';
import type { SpaceView } from '@dyce/shared';
import { Icon, Text, useTheme } from '@dyce/ui';
import { modeLine, spaceMeta } from '@/features/spaces/spaces-logic';

/**
 * A space in search results (design: SpaceSearch): name with the matching part kept simple, what game and who is
 * seated, Free or the Pool fee, and a Join (or Open, when you already sit there) pill. The whole row is the button.
 */
export function SpaceResultRow({ space, onPress }: { space: SpaceView; onPress: () => void }) {
  const { colors } = useTheme();
  const open = space.seated || space.status !== 'waiting';
  const action = space.seated ? 'Open' : space.status === 'waiting' ? 'Join' : 'View';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action} space ${space.name}. ${spaceMeta(space)}. ${modeLine(space)}. Code ${space.code}`}
      onPress={onPress}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <Icon name="planet" size={22} color={colors.accent} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {space.name}
        </Text>
        <Text color="sub" style={styles.sub} numberOfLines={1}>
          {spaceMeta(space)}
        </Text>
        <Text color="sub" style={styles.sub} numberOfLines={1}>
          {modeLine(space)} · {space.code}
        </Text>
      </View>
      <View
        style={[styles.pill, { backgroundColor: open ? colors.chip : '#C93E1C' }]}
        accessibilityElementsHidden
      >
        <Text style={[styles.pillText, { color: open ? colors.text : '#FFFFFF' }]}>{action}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontFamily: 'Figtree_600SemiBold' },
  sub: { fontSize: 13 },
  pill: {
    minHeight: 36,
    minWidth: 60,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
});
