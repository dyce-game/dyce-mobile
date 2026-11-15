import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';

/** A person with up to two lines of text and an actions area (buttons) underneath or beside them. */
export function FriendRow({
  name,
  username,
  detail,
  right,
  below,
}: {
  name: string;
  username: string;
  /** Extra line under the @username, e.g. "3 mutual friends · 2 days ago". */
  detail?: string | null;
  /** Control on the right of the row (e.g. a Remove button). */
  right?: ReactNode;
  /** Controls on their own line beneath (e.g. Accept / Ignore, or a confirm panel). */
  below?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: colors.line }]}>
      <View style={styles.top}>
        <InitialAvatar name={name || username} />
        <View style={styles.names}>
          <Text variant="callout" numberOfLines={1}>
            {name || username}
          </Text>
          <Text variant="footnote" color="sub" numberOfLines={1}>
            @{username}
          </Text>
          {detail ? (
            <Text variant="footnote" color="sub" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {below ? <View style={styles.below}>{below}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  names: { flex: 1, minWidth: 0 },
  below: { flexDirection: 'row', gap: 8, paddingLeft: 56 },
});
