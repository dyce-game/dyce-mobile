import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_DISPLAY_NAME_LENGTH } from '@dyce/shared';
import { MAX_FONT_SCALE, Text, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { useMeQuery } from '@/features/avatar/use-avatar';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { nameProblem } from '../profile-logic';
import { useUpdateProfile } from '../use-profile';

// the row itself shows focus; the browser's own outline would draw a box inside the card
const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * Edit profile (design: EditProfile): your avatar (opens the picker), your name, and your @username, which can't
 * be changed yet. The design's Status, "Show on my profile" and Sign-in methods wait for those features.
 */
export function EditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useMeQuery();
  const update = useUpdateProfile();
  const profile = me.data?.profile;
  const [draft, setDraft] = useState<string | null>(null);

  const name = draft ?? profile?.displayName ?? '';
  const problem = draft === null ? null : nameProblem(draft);
  const changed = draft !== null && draft.trim() !== (profile?.displayName ?? '');
  const canSave = !!profile && changed && !problem && !update.isPending;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile' as Href));

  function save() {
    if (!canSave) return;
    update.mutate({ displayName: name.trim() }, { onSuccess: close });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.grouped }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={close}
          style={styles.side}
        >
          <Text style={[styles.action, { color: colors.accent }]}>Cancel</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Edit profile
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          style={[styles.side, styles.sideRight]}
        >
          <Text
            style={[styles.action, styles.save, { color: canSave ? colors.accent : colors.sub }]}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatar}>
          <UserAvatar
            avatar={profile?.avatar}
            name={profile?.displayName || profile?.username || 'You'}
            size={104}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit avatar"
            onPress={() => router.push('/avatar' as Href)}
            style={styles.editAvatar}
          >
            <Text style={[styles.editAvatarText, { color: colors.accent }]}>Edit avatar</Text>
          </Pressable>
        </View>

        <Text style={styles.label} color="sub" accessibilityRole="header">
          Profile
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.field, { borderColor: colors.line }]}>
            <Text style={styles.fieldLabel} color="sub">
              Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setDraft}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              accessibilityLabel="Name"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              placeholderTextColor={colors.sub}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={save}
              style={[styles.input, { color: colors.text }, WEB_NO_OUTLINE]}
            />
          </View>
          <View style={[styles.field, styles.fieldLast]}>
            <Text style={styles.fieldLabel} color="sub">
              Username
            </Text>
            <Text
              style={styles.value}
              color="sub"
              accessibilityLabel={`Username, @${profile?.username ?? ''}`}
            >
              @{profile?.username ?? ''}
            </Text>
          </View>
        </View>
        {problem || update.isError ? (
          <Text color="accent" style={styles.note} accessibilityLiveRegion="polite">
            {problem ?? authErrorMessage(update.error)}
          </Text>
        ) : (
          <Text color="sub" style={styles.note}>
            Your @username is how friends find you. It can&apos;t be changed yet.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
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
  side: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  action: { fontSize: 17, fontFamily: 'Figtree_500Medium' },
  save: { fontFamily: 'Figtree_700Bold' },
  title: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { paddingBottom: 30 },
  avatar: { alignItems: 'center', gap: 4, paddingTop: 10, paddingBottom: 6 },
  editAvatar: { minHeight: 44, justifyContent: 'center' },
  editAvatarText: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  label: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  card: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  field: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  fieldLast: { borderBottomWidth: 0 },
  fieldLabel: { width: 100, fontSize: 15 },
  input: { flex: 1, minHeight: 44, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  value: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 20, paddingTop: 8 },
});
