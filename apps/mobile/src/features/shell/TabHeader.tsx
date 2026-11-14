import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, brand, useTheme } from '@dyce/ui';

/**
 * Tab title row. Profile avatar top-left (ember ring), optional "+" top-right (Chat and Spaces only).
 * Real avatars arrive with the avatar engine in Phase 1; this shows the user's initial.
 */
export function TabHeader({
  title,
  onPlus,
  right,
}: {
  title: string;
  onPlus?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          style={[styles.avatar, { borderColor: brand.ember.fill, backgroundColor: colors.chip }]}
        >
          <Text variant="callout">K</Text>
        </Pressable>
        {right ??
          (onPlus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`New in ${title}`}
              onPress={onPlus}
              style={[
                styles.plus,
                { backgroundColor: brand.ember.fill, borderBottomColor: brand.ember.edge },
              ]}
            >
              <Icon name="plus" size={22} color={brand.ember.text} />
            </Pressable>
          ) : null)}
      </View>
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
