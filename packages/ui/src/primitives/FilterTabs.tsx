import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { useTheme } from '../theme.tsx';
import { brand } from '../tokens.ts';

export type FilterTab<K extends string> = {
  key: K;
  label: string;
  /** Shown as an ember pill after the label when greater than zero. */
  count?: number;
};

/**
 * Underline filter tabs (Chat: All · Friends · Groups · Requests · Bots). The selected tab is bolder and gets a
 * 3pt ember bar on the bottom rule. Scrolls sideways if the labels don't fit (large text sizes).
 */
export function FilterTabs<K extends string>({
  tabs,
  selected,
  onSelect,
  label = 'Filter',
}: {
  tabs: FilterTab<K>[];
  selected: K;
  onSelect: (key: K) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rule, { borderColor: colors.line }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        contentContainerStyle={styles.row}
      >
        {tabs.map((t) => {
          const on = t.key === selected;
          const count = t.count ?? 0;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityLabel={count > 0 ? `${t.label}, ${count}` : t.label}
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(t.key)}
              style={styles.tab}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: on ? 'Figtree_800ExtraBold' : 'Figtree_600SemiBold',
                  color: on ? colors.text : colors.sub,
                }}
              >
                {t.label}
              </Text>
              {count > 0 ? (
                <View style={[styles.count, { backgroundColor: brand.ember.fill }]} aria-hidden>
                  <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
              <View
                style={[styles.bar, { backgroundColor: on ? brand.ember.fill : 'transparent' }]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { borderBottomWidth: 1 },
  row: { gap: 18, paddingHorizontal: 18, paddingTop: 4 },
  tab: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Figtree_800ExtraBold' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
