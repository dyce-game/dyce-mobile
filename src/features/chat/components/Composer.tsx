import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputKeyPressEvent,
  type TextStyle,
} from 'react-native';
import { MAX_MESSAGE_LENGTH } from '@dyce/shared';
import { Icon, MAX_FONT_SCALE, brand, useTheme } from '@dyce/ui';

/** Tell the other person we're typing at most this often. */
const TYPING_EVERY_MS = 2_500;
/** ...and say we stopped after this long without a keystroke. */
const TYPING_IDLE_MS = 4_000;

/**
 * Text composer: a growing field and a send button. Enter sends on web and hardware keyboards (Shift+Enter
 * is a new line); on phones Return is a new line and the button sends. The games, photo and money buttons
 * from the design arrive with their features, not as dead buttons now.
 */
export function Composer({
  onSend,
  onTyping,
  placeholder = 'Dyce message',
}: {
  onSend: (text: string) => void;
  onTyping?: (typing: boolean) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const lastTypingSent = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingOn = useRef(false);
  const canSend = text.trim().length > 0;

  const setTyping = (on: boolean) => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (on) {
      idle.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
      // say "typing" when we start, and again every few seconds while it continues
      if (!typingOn.current || Date.now() - lastTypingSent.current > TYPING_EVERY_MS) {
        typingOn.current = true;
        lastTypingSent.current = Date.now();
        onTyping?.(true);
      }
    } else if (typingOn.current) {
      typingOn.current = false;
      onTyping?.(false);
    }
  };
  // leaving the thread while typing must not leave "typing…" on their screen
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
      if (typingOn.current) onTyping?.(false);
    },
    [],
  );

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
    setTyping(false);
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const native = e.nativeEvent as { key: string; shiftKey?: boolean };
    if (native.key === 'Enter' && !native.shiftKey) {
      (e as unknown as { preventDefault?: () => void }).preventDefault?.();
      submit();
    }
  };

  return (
    <View style={[styles.bar, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <View style={[styles.field, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            setTyping(t.length > 0);
          }}
          onKeyPress={onKeyPress}
          onBlur={() => setTyping(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.sub}
          accessibilityLabel="Message"
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.input, webNoOutline, { color: colors.text }]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        style={[
          styles.send,
          canSend
            ? { backgroundColor: brand.ember.fill, borderBottomColor: brand.ember.edge }
            : { backgroundColor: colors.chip, borderBottomColor: colors.chip },
        ]}
      >
        <Icon name="send" size={20} color={canSend ? brand.ember.text : colors.sub} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  input: {
    fontFamily: 'Figtree_500Medium',
    fontSize: 16,
    paddingVertical: 10,
    minHeight: 24,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const webNoOutline: TextStyle | undefined =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : undefined;
