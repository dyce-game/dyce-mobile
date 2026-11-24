import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Icon, Text, useTheme } from '@dyce/ui';
import { config } from '@/lib/config';
import { EdgeFrame, EdgeTitle } from '../components/EdgeFrame';
import {
  HELP_TOPICS,
  LEGAL_DOCS,
  LEGAL_ORDER,
  helpItemsFor,
  type HelpTopicId,
} from '../legal-copy';

const TOPIC_COLORS: Record<HelpTopicId, string> = {
  pools: '#C93E1C',
  spaces: '#C2410C',
  account: '#2457D6',
  safety: '#0E7C47',
};

/**
 * Help and legal (design: Help; SPEC section 12). Topics filter the answers; each answer opens in place. Under it
 * Pool rules (their own screen) and the legal documents, which are DRAFT copy until a lawyer has reviewed them
 * (see legal-copy.ts and docs/BACKLOG.md). "Contact us" opens a mail to the published support address (Apple 1.2
 * and 1.5 need contact information in the app); the Privacy Policy and Terms also open from the hosted pages that
 * App Store Connect links to (5.1.1(i)).
 */
export function HelpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [topic, setTopic] = useState<HelpTopicId | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const items = helpItemsFor(topic);
  const go = (href: string) => router.push(href as Href);

  return (
    <EdgeFrame backLabel="Settings" grouped>
      <EdgeTitle sub="Answers, the Pool rules and the small print.">Help and legal</EdgeTitle>

      <View style={styles.topics} accessibilityRole="tablist">
        {HELP_TOPICS.map((t) => {
          const on = topic === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityLabel={t.title}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setTopic(on ? null : t.id);
                setOpen(null);
              }}
              style={[
                styles.topic,
                { backgroundColor: colors.card, borderColor: on ? colors.accent : 'transparent' },
              ]}
            >
              <View style={[styles.mark, { backgroundColor: TOPIC_COLORS[t.id] }]}>
                <Text style={styles.markText}>{t.mark}</Text>
              </View>
              <Text variant="callout" style={styles.topicText}>
                {t.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="footnote" color="sub" style={styles.label}>
        {topic ? (HELP_TOPICS.find((t) => t.id === topic)?.title ?? 'Answers') : 'Common questions'}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {items.map((item, i) => {
          const isOpen = open === item.q;
          return (
            <View
              key={item.q}
              style={[
                styles.faq,
                { borderColor: colors.line, borderBottomWidth: i === items.length - 1 ? 0 : 1 },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.q}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen(isOpen ? null : item.q)}
                style={styles.question}
              >
                <Text variant="callout" style={styles.flex}>
                  {item.q}
                </Text>
                <Text variant="headline" color="sub" accessibilityElementsHidden>
                  {isOpen ? '−' : '+'}
                </Text>
              </Pressable>
              {isOpen ? (
                <Text color="sub" style={styles.answer}>
                  {item.a}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text variant="footnote" color="sub" style={styles.label}>
        Rules and legal
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <LinkRow title="How Pool works" onPress={() => go('/pool-rules')} />
        {LEGAL_ORDER.map((id, i) => (
          <LinkRow
            key={id}
            title={LEGAL_DOCS[id].title}
            sub="Draft"
            last={i === LEGAL_ORDER.length - 1}
            onPress={() => go(`/settings/legal/${id}`)}
          />
        ))}
      </View>

      <Text variant="footnote" color="sub" style={styles.label}>
        Contact us
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <LinkRow
          title="Email support"
          sub={config.supportEmail}
          onPress={() =>
            void Linking.openURL(`mailto:${config.supportEmail}?subject=Dyce%20support`).catch(
              () => undefined,
            )
          }
        />
        <LinkRow
          title="Privacy Policy on the web"
          onPress={() => void Linking.openURL(config.privacyUrl).catch(() => undefined)}
        />
        <LinkRow
          title="Terms on the web"
          last
          onPress={() => void Linking.openURL(config.termsUrl).catch(() => undefined)}
        />
      </View>

      <Text color="sub" style={styles.contact}>
        If someone is cheating or bothering you, report or block them from their profile or the game
        menu. A person reads every report.
      </Text>
    </EdgeFrame>
  );
}

function LinkRow({
  title,
  sub,
  last,
  onPress,
}: {
  title: string;
  sub?: string;
  last?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      onPress={onPress}
      style={[styles.link, { borderColor: colors.line, borderBottomWidth: last ? 0 : 1 }]}
    >
      <Text style={styles.linkTitle}>{title}</Text>
      {sub ? (
        <Text variant="footnote" color="sub">
          {sub}
        </Text>
      ) : null}
      <View style={styles.chevron}>
        <Icon name="back" size={16} color={colors.sub} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topic: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 2,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mark: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontSize: 13, fontFamily: 'Figtree_800ExtraBold' },
  topicText: { flex: 1 },
  label: { paddingHorizontal: 4, paddingTop: 18, paddingBottom: 6 },
  card: { borderRadius: 16, overflow: 'hidden' },
  faq: { paddingHorizontal: 14 },
  question: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  answer: { paddingBottom: 14, fontSize: 14, lineHeight: 21 },
  link: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkTitle: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  chevron: { transform: [{ rotate: '180deg' }] },
  contact: { fontSize: 13, lineHeight: 19, paddingTop: 16, textAlign: 'center' },
});
