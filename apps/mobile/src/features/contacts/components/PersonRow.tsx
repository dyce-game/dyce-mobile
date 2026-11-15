import { Pressable, StyleSheet, View } from 'react-native';
import type { Relationship } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { addAction } from '../sync';

export type PersonRowProps = {
  /** Main line: the device contact name, or the display name. */
  primary: string;
  username: string;
  relationship: Relationship;
  busy?: boolean;
  onAdd: () => void;
};

/** One person: initial, names, and an Add / Accept / Requested / Friends button (44pt minimum target). */
export function PersonRow({ primary, username, relationship, busy, onAdd }: PersonRowProps) {
  const { colors } = useTheme();
  const action = addAction(relationship);
  const active = action.pressable && !busy;
  return (
    <View style={[styles.row, { borderColor: colors.line }]}>
      <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]} aria-hidden>
        <Text variant="callout" color="accent">
          {(primary || username).slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.names}>
        <Text variant="callout" numberOfLines={1}>
          {primary || username}
        </Text>
        <Text variant="footnote" color="sub" numberOfLines={1}>
          @{username}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action.label} @${username}`}
        accessibilityState={{ disabled: !active }}
        disabled={!active}
        onPress={onAdd}
        style={[
          styles.button,
          action.pressable
            ? {
                backgroundColor: brand.ember.fill,
                borderBottomColor: brand.ember.edge,
                borderBottomWidth: 3,
              }
            : { backgroundColor: colors.chip },
          busy ? { opacity: 0.6 } : null,
        ]}
      >
        <Text variant="callout" style={{ color: action.pressable ? brand.ember.text : colors.sub }}>
          {busy ? '…' : action.label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: { flex: 1, minWidth: 0 },
  button: {
    minHeight: 44,
    minWidth: 92,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
