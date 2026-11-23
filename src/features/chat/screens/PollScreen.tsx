import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
} from '@dyce/shared';
import { MAX_FONT_SCALE, Text, TokenButton, useTheme } from '@dyce/ui';
import { PillButton } from '@/components/PillButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { authErrorMessage } from '@/features/auth/messages';
import { newMessageId } from '../chat-logic';
import { useCreatePoll } from '../use-chat';

/**
 * Make a poll for a group ("What are we playing tonight?"): a question and two to six options. One vote each,
 * which members can change. The message id is picked once per form, so a retried Send can't post it twice.
 */
export function PollScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const create = useCreatePoll(conversationId);
  const pollId = useRef(newMessageId());
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const filled = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const ready = question.trim().length > 0 && filled.length >= MIN_POLL_OPTIONS;
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/c/${conversationId}` as Href);

  const setOption = (i: number, text: string) =>
    setOptions((o) => o.map((x, n) => (n === i ? text : x)));

  const submit = () => {
    if (!ready || create.isPending) return;
    create.mutate(
      { id: pollId.current, question: question.trim(), options: filled },
      { onSuccess: back },
    );
  };

  const field = [styles.input, { color: colors.text, backgroundColor: colors.chip }];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="New poll" fallback={`/c/${conversationId}`} />
        <Text variant="footnote" color="sub">
          Everyone in the group can vote once, and change their vote.
        </Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="What are we playing at 9?"
          placeholderTextColor={colors.sub}
          accessibilityLabel="Question"
          maxLength={MAX_POLL_QUESTION_LENGTH}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={field}
        />
        {options.map((o, i) => (
          <View key={i} style={styles.optionRow}>
            <TextInput
              value={o}
              onChangeText={(t) => setOption(i, t)}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.sub}
              accessibilityLabel={`Option ${i + 1}`}
              maxLength={MAX_POLL_OPTION_LENGTH}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[...field, styles.flex]}
            />
            {options.length > MIN_POLL_OPTIONS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove option ${i + 1}`}
                onPress={() => setOptions((all) => all.filter((_, n) => n !== i))}
                style={[styles.remove, { backgroundColor: colors.chip }]}
              >
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {options.length < MAX_POLL_OPTIONS ? (
          <View style={styles.add}>
            <PillButton label="Add option" onPress={() => setOptions((o) => [...o, ''])} />
          </View>
        ) : null}
        <TokenButton
          label={create.isPending ? 'Sending…' : 'Send poll'}
          disabled={!ready || create.isPending}
          onPress={submit}
        />
        {create.isError ? (
          <Text color="accent" accessibilityLiveRegion="polite">
            {authErrorMessage(create.error)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 60 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { fontSize: 22, lineHeight: 26, fontFamily: 'Figtree_700Bold' },
  add: { alignItems: 'flex-start' },
});
