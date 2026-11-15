import { StyleSheet, View } from 'react-native';
import type { Relationship } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { PillButton } from '@/components/PillButton';
import { addAction } from '../sync';

export type PersonRowProps = {
  /** Main line: the device contact name, or the display name. */
  primary: string;
  username: string;
  relationship: Relationship;
  busy?: boolean;
  onAdd: () => void;
};

/** One person: initial, names, and an Add / Accept / Requested / Friends button. */
export function PersonRow({ primary, username, relationship, busy, onAdd }: PersonRowProps) {
  const { colors } = useTheme();
  const action = addAction(relationship);
  return (
    <View style={[styles.row, { borderColor: colors.line }]}>
      <InitialAvatar name={primary || username} />
      <View style={styles.names}>
        <Text variant="callout" numberOfLines={1}>
          {primary || username}
        </Text>
        <Text variant="footnote" color="sub" numberOfLines={1}>
          @{username}
        </Text>
      </View>
      <PillButton
        label={action.label}
        tone={action.pressable ? 'primary' : 'neutral'}
        disabled={!action.pressable}
        busy={busy}
        accessibilityLabel={`${action.label} @${username}`}
        onPress={onAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1 },
  names: { flex: 1, minWidth: 0 },
});
