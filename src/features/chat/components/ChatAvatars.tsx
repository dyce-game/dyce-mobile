import { StyleSheet, View } from 'react-native';
import type { GroupMemberPreview } from '@dyce/shared';
import { Text, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';

/**
 * A group's avatar (design: Chats, groups): up to three members' avatars in a loose cluster. A group with
 * nobody else in it yet (everyone else left) shows its first letter. Group photos are a placeholder until
 * uploads exist, so this is the only picture a group has.
 */
export function GroupAvatar({
  members,
  title,
  size = 54,
}: {
  members: GroupMemberPreview[];
  title: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const [a, b, c] = members;
  if (!a) {
    return (
      <View
        aria-hidden
        style={[
          styles.initial,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandSoft },
        ]}
      >
        <Text
          style={{ color: colors.accent, fontFamily: 'Figtree_800ExtraBold', fontSize: size * 0.4 }}
        >
          {(title.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    );
  }
  // sizes follow the design at 54: 34, 28 and 30
  const big = Math.round(size * 0.63);
  const small = Math.round(size * 0.52);
  const mid = Math.round(size * 0.56);
  const ring = { borderWidth: 2, borderColor: colors.bg, borderRadius: 999 } as const;
  const one = (m: GroupMemberPreview, s: number) => (
    <View style={ring}>
      <UserAvatar avatar={m.avatar} name={m.displayName || m.username} size={s} />
    </View>
  );
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: 0 }}>{one(a, big)}</View>
      {b ? (
        <View style={{ position: 'absolute', right: 0, top: size * 0.11 }}>{one(b, small)}</View>
      ) : null}
      {c ? (
        <View style={{ position: 'absolute', left: size * 0.26, bottom: 0 }}>{one(c, mid)}</View>
      ) : null}
    </View>
  );
}

/** A bot's tile (design: Chats, bots): a rounded square in its colour with two white "eyes". */
export function BotTile({ color, size = 54 }: { color: string; size?: number }) {
  const eyeW = Math.round(size * 0.17);
  const eyeH = Math.round(size * 0.24);
  return (
    <View
      aria-hidden
      style={[
        styles.bot,
        {
          width: size,
          height: size,
          borderRadius: size / 3,
          backgroundColor: color,
          gap: size * 0.15,
        },
      ]}
    >
      <View
        style={{ width: eyeW, height: eyeH, borderRadius: eyeW / 2, backgroundColor: '#FFFFFF' }}
      />
      <View
        style={{ width: eyeW, height: eyeH, borderRadius: eyeW / 2, backgroundColor: '#FFFFFF' }}
      />
    </View>
  );
}

/** The small pill at the end of a row (BOT, GROUP...). Never the only signal: the row's label says it too. */
export function RowTag({
  label,
  background,
  edge,
}: {
  label: string;
  background: string;
  edge: string;
}) {
  return (
    <View
      aria-hidden
      style={[styles.tag, { backgroundColor: background, borderBottomColor: edge }]}
    >
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center' },
  bot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.18)',
  },
  tag: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    borderBottomWidth: 2,
    justifyContent: 'center',
  },
  tagText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Figtree_800ExtraBold' },
});
