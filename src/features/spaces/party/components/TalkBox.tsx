import { StyleSheet, View } from 'react-native';
import type { LiveChat } from '@dyce/shared';
import { Text } from '@dyce/ui';
import { recentTalk, type NameOf, type TalkState } from '../common-logic';
import { GLASS, GLASS_EDGE, ON, ON_DIM, SendRow } from './PartyChrome';

/**
 * Table talk: the last few lines the room let you hear, and a box to answer when the game lets you talk
 * (`talkState` says when). The room decides who hears what; this only offers what it would accept.
 */
export function TalkBox({
  chats,
  talk,
  nameOf,
  onSend,
  lines = 3,
}: {
  chats: readonly LiveChat[];
  talk: TalkState;
  nameOf: NameOf;
  onSend: (text: string) => boolean;
  lines?: number;
}) {
  const recent = recentTalk(chats, lines);
  return (
    <View style={styles.box}>
      <View accessibilityLiveRegion="polite" accessibilityLabel="Table talk" style={styles.lines}>
        {recent.length === 0 ? (
          <Text variant="footnote" style={{ color: ON_DIM }}>
            {talk.open ? 'Nothing said yet.' : talk.note}
          </Text>
        ) : (
          recent.map((c) => (
            <Text key={c.id} variant="footnote" style={{ color: ON }} numberOfLines={2}>
              <Text variant="footnote" style={{ color: '#FFD27A' }}>
                {nameOf(c.userId)}{' '}
              </Text>
              {c.text}
            </Text>
          ))
        )}
      </View>
      {talk.open ? (
        <View style={styles.send}>
          <SendRow
            label="Say something to the table"
            placeholder="Say something"
            button="Send"
            maxLength={200}
            tone="brass"
            onSend={onSend}
          />
        </View>
      ) : null}
      {recent.length > 0 || talk.open ? (
        <Text variant="caption" style={{ color: ON_DIM }}>
          {talk.note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    gap: 6,
    borderRadius: 18,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_EDGE,
  },
  lines: { gap: 2, minHeight: 20 },
  send: { flexDirection: 'row' },
});
