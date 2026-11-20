import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from '@dyce/ui';

/** Page colours from the design (InviteLanding and its dark twin): a faint lilac page behind the card. */
export function usePageColor(): string {
  const { isDark } = useTheme();
  return isDark ? '#0B0814' : '#F4F1FF';
}

/** The Dyce mark (design: InviteLanding): an ember tile with five pips, drawn with views so it is crisp at any size. */
export function DyceMark({ size = 30 }: { size?: number }) {
  const pip = Math.max(3, Math.round(size * 0.14));
  const cells = [0, 2, 4, 6, 8];
  return (
    <View
      aria-hidden
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size * 0.3, padding: size * 0.2 },
      ]}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={styles.cell}>
          {cells.includes(i) ? (
            <View
              style={{ width: pip, height: pip, borderRadius: pip / 2, backgroundColor: '#fff' }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The page behind every invite screen: wordmark on top, content in a column no wider than a phone (so the
 * web page looks right on a laptop too), safe areas respected.
 */
export function InviteFrame({
  children,
  right,
  scroll = true,
}: {
  children: ReactNode;
  /** Top-right link, e.g. "Open in app". */
  right?: { label: string; onPress: () => void };
  scroll?: boolean;
}) {
  const page = usePageColor();
  const { colors } = useTheme();
  const body = (
    <View style={styles.column}>
      <View style={styles.top}>
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="Dyce">
          <DyceMark />
          <Text variant="headline" style={styles.word}>
            dyce
          </Text>
        </View>
        {right ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={right.label}
            onPress={right.onPress}
            style={styles.link}
          >
            <Text variant="callout" color={colors.accent}>
              {right.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: page }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontSize: 22 },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  mark: {
    backgroundColor: '#C93E1C',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
});
