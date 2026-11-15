import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TokenButton, useTheme } from '@dyce/ui';
import { InitialAvatar } from '@/components/InitialAvatar';
import { authErrorMessage } from '@/features/auth/messages';
import { useConversationQuery } from '@/features/chat/use-chat';
import { reportHref } from '../safety-logic';
import { useBlockUser } from '../use-safety';

/**
 * Chat info (design: ChatInfo): who this is, quick actions (Send, Request), and the rows at the bottom: Report
 * and Block. Blocking asks first and says what it does. Mute, search, clear, shared games and head-to-head
 * from the design arrive with those features; nothing here is a dead control.
 */
export function ChatInfoScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const conv = useConversationQuery(conversationId);
  const block = useBlockUser();
  const [confirming, setConfirming] = useState(false);

  const peer = conv.data?.peer;
  const name = peer?.displayName || peer?.username || 'Chat';
  const done = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));
  const go = (href: string) => router.push(href as Href);

  // money goes to friends (and contacts): a stranger in Requests gets no Send / Request
  const tiles: { glyph: string; label: string; onPress: () => void }[] =
    peer?.relationship === 'friends'
      ? [
          { glyph: '₦', label: 'Send', onPress: () => go(`/wallet/send?to=${peer.id}`) },
          { glyph: '↓', label: 'Request', onPress: () => go('/wallet/request') },
        ]
      : [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg2 }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={done}
          style={styles.doneBtn}
        >
          <Text style={[styles.done, { color: colors.accent }]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.who}>
          <InitialAvatar name={name} size={92} />
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {peer ? (
            <Text variant="footnote" color="sub">
              @{peer.username} · {peer.relationship === 'friends' ? 'friends' : 'not friends yet'}
            </Text>
          ) : null}
        </View>

        {tiles.length > 0 ? (
          <View style={styles.tiles}>
            {tiles.map((t) => (
              <Pressable
                key={t.label}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={t.onPress}
                style={[styles.tile, { backgroundColor: colors.card }]}
              >
                <Text style={[styles.glyph, { color: colors.accent }]}>{t.glyph}</Text>
                <Text style={[styles.tileLabel, { color: colors.accent }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {peer ? (
          <View style={[styles.rows, { backgroundColor: colors.card }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Report @${peer.username}`}
              onPress={() =>
                go(
                  reportHref({
                    userId: peer.id,
                    username: peer.username,
                    name: peer.displayName,
                    conversationId,
                  }),
                )
              }
              style={[styles.row, { borderColor: colors.line }]}
            >
              <Text style={[styles.rowText, { color: colors.danger }]}>
                Report @{peer.username}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Block @${peer.username}`}
              onPress={() => setConfirming(true)}
              style={styles.row}
            >
              <Text style={[styles.rowText, { color: colors.danger }]}>Block @{peer.username}</Text>
            </Pressable>
          </View>
        ) : null}

        {confirming && peer ? (
          <View
            style={[styles.confirm, { backgroundColor: colors.card }]}
            accessibilityLiveRegion="polite"
          >
            <Text variant="headline">Block @{peer.username}?</Text>
            <Text color="sub">
              They won&apos;t be able to message you, send you money or find you, and you won&apos;t
              see them. They aren&apos;t told. If you were friends, that ends. You can unblock them
              any time from Blocked people.
            </Text>
            {block.isError ? <Text color="accent">{authErrorMessage(block.error)}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm block @${peer.username}`}
              disabled={block.isPending}
              onPress={() =>
                block.mutate(peer.id, { onSuccess: () => router.replace('/chat' as Href) })
              }
              style={[styles.blockBtn, { backgroundColor: colors.danger }]}
            >
              <Text style={styles.blockText}>{block.isPending ? 'Blocking…' : 'Block'}</Text>
            </Pressable>
            <TokenButton
              label="Cancel"
              tone="chip"
              disabled={block.isPending}
              onPress={() => setConfirming(false)}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  doneBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  done: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  who: { alignItems: 'center', gap: 4 },
  name: { fontSize: 24, marginTop: 4, fontFamily: 'BricolageGrotesque_800ExtraBold' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 2 },
  tile: {
    flex: 1,
    minHeight: 62,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  glyph: { fontSize: 17, fontFamily: 'Figtree_800ExtraBold' },
  tileLabel: { fontSize: 12, fontFamily: 'Figtree_700Bold' },
  rows: { borderRadius: 18, overflow: 'hidden' },
  row: {
    minHeight: 50,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: 'transparent',
  },
  rowText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  confirm: { borderRadius: 18, padding: 16, gap: 10 },
  blockBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  blockText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Figtree_700Bold' },
});
