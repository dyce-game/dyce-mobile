import { useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Glass } from './Glass.tsx';
import { Text } from './Text.tsx';
import { Icon, type IconName } from '../icons/Icon.tsx';
import { useTheme } from '../theme.tsx';
import { brand, MIN_TOUCH, tabBar } from '../tokens.ts';

export type TabBarItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Unread count shown as a small badge on the icon (nothing when 0 or missing). */
  badge?: number;
};

export type TabBarProps = {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onSearch: () => void;
  /** Safe-area bottom inset, added to the 26pt resting offset. */
  bottomInset?: number;
};

/**
 * The only bottom navigation in Dyce (CLAUDE.md): a glass pill (Chat · Spaces · Wallet) with an
 * active highlight, plus a separate glass search circle. 68pt tall, 26pt above the bottom, with a
 * fade-to-background gradient behind it. Navigation-library agnostic: the app adapts router props.
 */
export function TabBar({ items, activeKey, onSelect, onSearch, bottomInset = 0 }: TabBarProps) {
  const { colors } = useTheme();
  // SVG ids are document-global on web: two TabBars (e.g. light + dark specimens) must not share one.
  const fadeId = `tabfade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const totalHeight = tabBar.height + tabBar.bottomOffset + bottomInset + 24;

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: totalHeight }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
      </Svg>

      <View
        style={[styles.row, { bottom: tabBar.bottomOffset + bottomInset }]}
        pointerEvents="box-none"
      >
        <Glass style={styles.pill} radius={tabBar.height / 2}>
          <View style={styles.pillInner} accessibilityRole="tablist">
            {items.map((it) => {
              const active = it.key === activeKey;
              return (
                <Pressable
                  key={it.key}
                  accessibilityRole="tab"
                  accessibilityLabel={
                    it.badge && it.badge > 0 ? `${it.label}, ${it.badge} unread` : it.label
                  }
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(it.key)}
                  style={[styles.tab, active && { backgroundColor: brand.ember.fill }]}
                >
                  <View>
                    <Icon name={it.icon} size={24} color={active ? brand.ember.text : colors.sub} />
                    {it.badge && it.badge > 0 ? (
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: active ? brand.ember.text : brand.ember.fill,
                            borderColor: active ? brand.ember.fill : colors.bg,
                          },
                        ]}
                        aria-hidden
                      >
                        <Text
                          variant="caption"
                          style={{
                            color: active ? brand.ember.fill : brand.ember.text,
                            fontSize: 10,
                          }}
                        >
                          {it.badge > 9 ? '9+' : it.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    variant="footnote"
                    style={{ color: active ? brand.ember.text : colors.sub, fontSize: 12 }}
                  >
                    {it.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Glass>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={onSearch}>
          <Glass
            radius={tabBar.searchSize / 2}
            style={{ width: tabBar.searchSize, height: tabBar.searchSize }}
          >
            <View style={styles.search}>
              <Icon name="search" size={26} color={colors.text} />
            </View>
          </Glass>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  row: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: { flex: 1, height: tabBar.height },
  pillInner: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 6, gap: 4 },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    height: tabBar.height - 12,
    borderRadius: (tabBar.height - 12) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  search: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
