import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NextStep } from '@dyce/shared';
import { Avatar, Icon, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { hrefForStep } from '@/features/auth/routes';
import { authApi, sessionStore } from '@/lib/api';
import { useMeQuery, useSetAvatar } from '../use-avatar';
import {
  HAIR_FILTERS,
  SKIN_FILTERS,
  STARTER_LOOKS,
  filterLooks,
  imageFor,
  lookById,
  randomLook,
  type HairType,
  type SkinTone,
} from '../starter-logic';

/**
 * Pick a starter look (design: AvatarBuilder, until the editable 3D builder arrives; AVATAR_GUIDEBOOK section 8,
 * phase A). A big preview, filters by skin tone and hair type, a grid of the 220 looks, and a shuffle button.
 * Used in onboarding (with "Skip for now") and later from Edit profile (`onboarding` false).
 */
export function StarterLookScreen({ onboarding }: { onboarding: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useMeQuery();
  const save = useSetAvatar();
  const [skin, setSkin] = useState<SkinTone | null>(null);
  const [hair, setHair] = useState<HairType | null>(null);
  const [picked, setPicked] = useState<string | null>(
    () => me.data?.profile?.avatar?.preset ?? randomLook(STARTER_LOOKS, null)?.id ?? null,
  );
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const looks = useMemo(() => filterLooks({ skin, hair }), [skin, hair]);
  const grid = useRef<FlatList>(null);
  // a new filter is a new list: start at the top, not wherever the last one was scrolled to
  useEffect(() => {
    grid.current?.scrollToOffset({ offset: 0, animated: false });
  }, [skin, hair]);
  const look = lookById(picked);
  const busy = save.isPending || skipping;

  function advance(next: NextStep) {
    sessionStore.getState().setNextStep(next);
    router.replace(hrefForStep(next) as Href);
  }
  function leave(next?: NextStep) {
    if (onboarding && next) advance(next);
    else if (router.canGoBack()) router.back();
    else router.replace('/chat' as Href);
  }

  function use() {
    if (!look) return;
    setError(undefined);
    save.mutate(
      { v: 1, preset: look.id },
      { onSuccess: (res) => leave(res.nextStep), onError: (e) => setError(authErrorMessage(e)) },
    );
  }

  async function skip() {
    setSkipping(true);
    setError(undefined);
    try {
      const res = await authApi.completeStep('avatar');
      advance(res.nextStep);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSkipping(false);
    }
  }

  function shuffle() {
    const next = randomLook(looks.length > 0 ? looks : STARTER_LOOKS, picked);
    if (next) setPicked(next.id);
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        {onboarding ? (
          <View style={styles.side} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => leave()}
            style={styles.side}
          >
            <Icon name="back" size={24} color={colors.text} />
          </Pressable>
        )}
        <Text style={styles.title} accessibilityRole="header">
          Pick your look
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shuffle"
          onPress={shuffle}
          style={[styles.side, styles.sideRight]}
        >
          <Icon name="shuffle" size={24} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.preview}>
        <View style={styles.shadow} aria-hidden />
        <Avatar size={176} name="" source={imageFor(look ? { v: 1, preset: look.id } : null)} />
        <Text
          variant="footnote"
          color="sub"
          style={styles.caption}
          accessibilityLiveRegion="polite"
        >
          {look ? look.label : 'Choose a look'}
        </Text>
      </View>

      <View style={[styles.panel, { backgroundColor: colors.bg2 }]}>
        <Text style={styles.label} color="sub">
          Skin tone
        </Text>
        <ScrollView
          horizontal
          style={styles.chipScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip label="All" on={skin === null} onPress={() => setSkin(null)} />
          {SKIN_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              swatch={f.swatch}
              on={skin === f.key}
              onPress={() => setSkin(skin === f.key ? null : f.key)}
            />
          ))}
        </ScrollView>
        <Text style={styles.label} color="sub">
          Hair
        </Text>
        <ScrollView
          horizontal
          style={styles.chipScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip label="All" on={hair === null} onPress={() => setHair(null)} />
          {HAIR_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              on={hair === f.key}
              onPress={() => setHair(hair === f.key ? null : f.key)}
            />
          ))}
        </ScrollView>

        <FlatList
          ref={grid}
          data={looks}
          keyExtractor={(l) => l.id}
          numColumns={4}
          style={styles.grid}
          contentContainerStyle={styles.gridContent}
          initialNumToRender={20}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.none}>
              <Text color="sub">No looks match. Try another skin tone or hair.</Text>
              <TokenButton
                label="Clear filters"
                tone="chip"
                onPress={() => {
                  setSkin(null);
                  setHair(null);
                }}
              />
            </View>
          }
          renderItem={({ item }) => {
            const on = item.id === picked;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Look: ${item.label}`}
                accessibilityState={{ selected: on }}
                onPress={() => setPicked(item.id)}
                style={styles.cell}
              >
                <View style={[styles.ring, { borderColor: on ? brand.ember.fill : 'transparent' }]}>
                  <Avatar size={64} name="" source={imageFor({ v: 1, preset: item.id })} />
                </View>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.footer}>
        {error ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <TokenButton
          label={save.isPending ? 'Saving…' : onboarding ? 'Use this look' : 'Save'}
          tone="ember"
          disabled={!look || busy}
          onPress={use}
        />
        {onboarding ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
            disabled={busy}
            onPress={() => void skip()}
            style={styles.skip}
          >
            <Text color="sub" style={styles.skipText}>
              {skipping ? 'One moment…' : 'Skip for now'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  on,
  onPress,
  swatch,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? colors.ink : colors.card }]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} aria-hidden /> : null}
      <Text style={[styles.chipText, { color: on ? colors.inkText : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  side: { width: 44, minHeight: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  title: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  preview: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  shadow: {
    position: 'absolute',
    bottom: 26,
    width: 130,
    height: 20,
    borderRadius: 65,
    backgroundColor: 'rgba(90,30,10,0.14)',
  },
  caption: { marginTop: 8, textAlign: 'center', paddingHorizontal: 24, minHeight: 18 },
  panel: { flex: 1, marginHorizontal: 16, marginTop: 8, borderRadius: 24, paddingTop: 12 },
  label: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', paddingHorizontal: 16, paddingTop: 2 },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  chipText: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  grid: { flex: 1, marginTop: 4 },
  gridContent: { paddingHorizontal: 8, paddingBottom: 12 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 4, minHeight: 44 },
  ring: { padding: 3, borderWidth: 3, borderRadius: 40 },
  none: { padding: 16, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 6 },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
});
