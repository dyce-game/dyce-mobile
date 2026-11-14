import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { kobo } from '@dyce/shared';
import {
  ICON_NAMES,
  Chip,
  Icon,
  ModeBadge,
  TabBar,
  Text,
  ThemeProvider,
  TokenButton,
  WalletPill,
  brand,
  useTheme,
  type BrandName,
  type ModeBadgeKind,
  type ThemeName,
  type TypeToken,
} from '@dyce/ui';

const TONES: BrandName[] = ['ember', 'brass', 'felt', 'sms', 'bot'];
const BADGES: ModeBadgeKind[] = ['FREE', 'POOL', 'SPACE', 'YOUR TURN', 'SMS', 'BOT', 'REQUEST'];
const TYPES: TypeToken[] = [
  'display',
  'title',
  'headline',
  'body',
  'callout',
  'footnote',
  'caption',
];

function Specimen({ theme }: { theme: ThemeName }) {
  return (
    <ThemeProvider forceTheme={theme}>
      <SpecimenBody theme={theme} />
    </ThemeProvider>
  );
}

function SpecimenBody({ theme }: { theme: ThemeName }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState('chat');
  const [chip, setChip] = useState('All');
  return (
    <View style={[styles.panel, { backgroundColor: colors.bg, borderColor: colors.line }]}>
      <Text variant="caption" color="sub">
        {theme} theme
      </Text>

      <View style={styles.wrap}>
        {TONES.map((t) => (
          <TokenButton key={t} label={t} tone={t} />
        ))}
        <TokenButton label="chip" tone="chip" />
        <TokenButton label="With icon" icon="send" />
        <TokenButton label="Disabled" disabled />
      </View>

      <View style={styles.wrap}>
        {BADGES.map((b) => (
          <ModeBadge key={b} kind={b} />
        ))}
      </View>

      <View style={styles.wrap}>
        {['All', 'Friends', 'Groups'].map((c) => (
          <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
        ))}
        <WalletPill balance={kobo(20_000_000)} />
        <WalletPill balance={kobo(1_250_000)} />
      </View>

      <View style={styles.wrap}>
        {ICON_NAMES.map((n) => (
          <View key={n} style={[styles.icon, { backgroundColor: colors.chip }]}>
            <Icon name={n} color={colors.text} />
          </View>
        ))}
        <View style={[styles.icon, { backgroundColor: brand.ember.fill }]}>
          <Icon name="qr" color={brand.ember.text} />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        {TYPES.map((t) => (
          <Text key={t} variant={t}>
            {t} — Your move
          </Text>
        ))}
        <Text color="sub">Secondary text</Text>
        <Text color="accent">Accent text</Text>
        <Text color="money" variant="callout">
          +₦2,000 (virtual)
        </Text>
      </View>

      <View style={[styles.tabPreview, { backgroundColor: colors.bg }]}>
        <TabBar
          items={[
            { key: 'chat', label: 'Chat', icon: 'chat' },
            { key: 'spaces', label: 'Spaces', icon: 'planet' },
            { key: 'wallet', label: 'Wallet', icon: 'wallet' },
          ]}
          activeKey={tab}
          onSelect={setTab}
          onSearch={() => undefined}
        />
      </View>
    </View>
  );
}

// Dev-only gallery: both themes at once so light/dark regressions are obvious.
export default function UiGallery() {
  if (!__DEV__) return <Redirect href="/chat" />;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Specimen theme="light" />
      <Specimen theme="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  panel: { borderWidth: 1, borderRadius: 24, padding: 16, gap: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabPreview: { height: 150, overflow: 'hidden', position: 'relative' },
});
