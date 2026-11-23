import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_GROUP_TITLE_LENGTH, type GroupMember } from '@dyce/shared';
import { MAX_FONT_SCALE, Text, TokenButton, brand, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { useSession } from '@/features/auth/use-session';
import { memberCountLabel } from '../chat-logic';
import { GroupAvatar } from '../components/ChatAvatars';
import {
  useConversationQuery,
  useGroupMembersQuery,
  useLeaveGroup,
  useRemoveMember,
  useRenameGroup,
  useSetMemberRole,
} from '../use-chat';

/**
 * A group's page (reached from the thread's header): its name, who is in it, and what you can do. Admins
 * rename the group, add friends, make members admins and remove them; an admin can step down while another
 * admin remains; anyone can leave. If the last admin leaves, the longest-standing member becomes admin.
 */
export function GroupInfoScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useSession((s) => s.userId);
  const conv = useConversationQuery(conversationId);
  const membersQuery = useGroupMembersQuery(conversationId);
  const rename = useRenameGroup(conversationId);
  const setRole = useSetMemberRole(conversationId);
  const remove = useRemoveMember(conversationId);
  const leave = useLeaveGroup(conversationId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const group = conv.data?.kind === 'group' ? conv.data.group : null;
  const members = (membersQuery.data?.members ?? []).filter((m) => m.state === 'active');
  const isAdmin = group?.role === 'admin';
  const adminCount = members.filter((m) => m.role === 'admin').length;
  const missing = conv.isError && conv.error instanceof ApiError && conv.error.status === 404;
  const actionError = rename.error ?? setRole.error ?? remove.error ?? leave.error;

  const startRename = () => {
    setTitle(group?.title ?? '');
    setEditing(true);
  };
  const saveRename = () => {
    const next = title.trim();
    if (!next || next === group?.title) return setEditing(false);
    rename.mutate(next, { onSuccess: () => setEditing(false) });
  };

  if (missing || (conv.isSuccess && !group)) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.pad}>
          <ScreenHeader title="Group info" fallback="/chat" />
          <View style={styles.center}>
            <Text variant="headline">This group isn&apos;t available</Text>
            <TokenButton label="Back to chats" onPress={() => router.replace('/chat' as Href)} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const memberRow = (m: GroupMember) => {
    const self = m.user.id === myId;
    const name = m.user.displayName || m.user.username;
    const canManage = isAdmin && !self && m.role !== 'admin';
    const canStepDown = self && m.role === 'admin' && adminCount > 1;
    return (
      <View key={m.user.id} style={[styles.member, { borderColor: colors.line }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}${self ? ' (you)' : ''}${m.role === 'admin' ? ', admin' : ''}. ${
            self ? 'Your profile' : 'Open profile'
          }`}
          onPress={() => router.push(self ? '/profile' : (`/u/${m.user.username}` as Href))}
          style={styles.memberTop}
        >
          <UserAvatar avatar={m.user.avatar} name={name} size={44} />
          <View style={styles.names}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
              {self ? ' (you)' : ''}
            </Text>
            <Text color="sub" numberOfLines={1} style={styles.handle}>
              @{m.user.username}
            </Text>
          </View>
          {m.role === 'admin' ? (
            <View style={[styles.tag, { backgroundColor: colors.brandSoft }]} aria-hidden>
              <Text style={[styles.tagText, { color: colors.accent }]}>ADMIN</Text>
            </View>
          ) : null}
        </Pressable>
        {canManage ? (
          confirmRemove === m.user.id ? (
            <View style={styles.actions}>
              <Text variant="footnote" color="sub" style={styles.confirmText}>
                Remove {name} from the group?
              </Text>
              <PillButton label="Keep" onPress={() => setConfirmRemove(null)} />
              <PillButton
                label="Remove"
                tone="danger"
                busy={remove.isPending}
                accessibilityLabel={`Remove ${name} from the group`}
                onPress={() =>
                  remove.mutate(m.user.id, { onSettled: () => setConfirmRemove(null) })
                }
              />
            </View>
          ) : (
            <View style={styles.actions}>
              <PillButton
                label="Make admin"
                accessibilityLabel={`Make ${name} an admin`}
                busy={setRole.isPending && setRole.variables?.userId === m.user.id}
                onPress={() => setRole.mutate({ userId: m.user.id, role: 'admin' })}
              />
              <PillButton
                label="Remove"
                accessibilityLabel={`Remove ${name}`}
                onPress={() => setConfirmRemove(m.user.id)}
              />
            </View>
          )
        ) : canStepDown ? (
          <View style={styles.actions}>
            <PillButton
              label="Step down as admin"
              busy={setRole.isPending}
              onPress={() => setRole.mutate({ userId: m.user.id, role: 'member' })}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Group info" fallback={`/c/${conversationId}`} />

        {group ? (
          <View style={styles.hero}>
            <GroupAvatar members={group.members} title={group.title} size={92} />
            {editing ? (
              <View style={styles.renameBox}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  accessibilityLabel="Group name"
                  maxLength={MAX_GROUP_TITLE_LENGTH}
                  autoFocus
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[
                    styles.renameInput,
                    { color: colors.text, borderColor: brand.ember.fill },
                  ]}
                />
                <View style={styles.actions}>
                  <PillButton label="Cancel" onPress={() => setEditing(false)} />
                  <PillButton
                    label="Save"
                    tone="primary"
                    busy={rename.isPending}
                    disabled={title.trim().length === 0}
                    onPress={saveRename}
                  />
                </View>
              </View>
            ) : (
              <>
                <Text accessibilityRole="header" style={styles.title}>
                  {group.title}
                </Text>
                <Text color="sub">{memberCountLabel(group.memberCount)}</Text>
                {isAdmin ? <PillButton label="Rename group" onPress={startRename} /> : null}
              </>
            )}
          </View>
        ) : conv.isLoading ? (
          <Text color="sub">Loading…</Text>
        ) : null}

        {group ? (
          <View style={styles.buttons}>
            {isAdmin ? (
              <TokenButton
                label="Add people"
                tone="chip"
                onPress={() => router.push(`/group-add/${conversationId}` as Href)}
              />
            ) : null}
            <TokenButton
              label="Start a Space"
              tone="chip"
              onPress={() => router.push('/space/new' as Href)}
            />
          </View>
        ) : null}

        <Text variant="caption" color="sub" accessibilityRole="header" style={styles.section}>
          People
        </Text>
        {membersQuery.isLoading ? <Text color="sub">Loading the list…</Text> : null}
        {membersQuery.isError ? (
          <View style={styles.block}>
            <Text color="accent">{authErrorMessage(membersQuery.error)}</Text>
            <TokenButton
              label="Try again"
              tone="chip"
              onPress={() => void membersQuery.refetch()}
            />
          </View>
        ) : null}
        {members.map(memberRow)}

        {actionError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(actionError)}
          </Text>
        ) : null}

        {group ? (
          <View style={styles.leave}>
            {confirmLeave ? (
              <View style={styles.block}>
                <Text variant="footnote" color="sub">
                  Leave {group.title}? You won&apos;t get new messages.
                  {isAdmin && adminCount === 1 ? ' Someone else will become admin.' : ''} A friend
                  can add you back.
                </Text>
                <View style={styles.actions}>
                  <PillButton label="Stay" onPress={() => setConfirmLeave(false)} />
                  <PillButton
                    label="Leave group"
                    tone="danger"
                    busy={leave.isPending}
                    onPress={() =>
                      leave.mutate(undefined, {
                        onSuccess: () => router.replace('/chat' as Href),
                      })
                    }
                  />
                </View>
              </View>
            ) : (
              <PillButton label="Leave group" tone="danger" onPress={() => setConfirmLeave(true)} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 20, gap: 10, paddingBottom: 60 },
  center: { alignItems: 'center', gap: 12, paddingTop: 60 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  title: { fontSize: 24, fontFamily: 'BricolageGrotesque_700Bold', textAlign: 'center' },
  renameBox: { alignSelf: 'stretch', gap: 10, alignItems: 'center' },
  renameInput: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderBottomWidth: 2,
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    textAlign: 'center',
  },
  buttons: { gap: 10 },
  section: { marginTop: 12 },
  block: { gap: 12 },
  member: { borderBottomWidth: 1, paddingVertical: 8, gap: 6 },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  handle: { fontSize: 12 },
  tag: { height: 22, paddingHorizontal: 9, borderRadius: 11, justifyContent: 'center' },
  tagText: { fontSize: 11, fontFamily: 'Figtree_800ExtraBold' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 56,
  },
  confirmText: { flexBasis: '100%' },
  leave: { marginTop: 18, alignItems: 'flex-start' },
});
