import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@dyce/ui';
import { EdgeFrame, EdgeTitle } from '../components/EdgeFrame';
import { LEGAL_DOCS, LEGAL_DRAFT_NOTICE, isLegalDocId } from '../legal-copy';

/**
 * One legal document (terms, privacy notice, community guidelines, responsible play). The text is DRAFT until it
 * has been reviewed by a lawyer (SPEC section 14), and the banner says so on every one of them.
 */
export function LegalScreen({ doc }: { doc: string | undefined }) {
  const { colors } = useTheme();
  const found = isLegalDocId(doc) ? LEGAL_DOCS[doc] : null;
  return (
    <EdgeFrame backLabel="Help" fallback="/settings/help">
      <EdgeTitle sub={found?.summary}>{found?.title ?? 'Not found'}</EdgeTitle>
      <View
        style={[styles.draft, { backgroundColor: '#FFF1E0', borderColor: '#E3A93B' }]}
        accessibilityRole="alert"
        accessible
        accessibilityLabel={LEGAL_DRAFT_NOTICE}
      >
        <Text variant="footnote" color="#7A3E00">
          {LEGAL_DRAFT_NOTICE}
        </Text>
      </View>
      {found ? (
        found.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text variant="headline" accessibilityRole="header">
              {s.heading}
            </Text>
            {s.paragraphs.map((p, i) => (
              <Text key={i} style={[styles.p, { color: colors.text }]}>
                {p}
              </Text>
            ))}
          </View>
        ))
      ) : (
        <Text color="sub">That document doesn’t exist.</Text>
      )}
    </EdgeFrame>
  );
}

const styles = StyleSheet.create({
  draft: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 6 },
  section: { gap: 6, marginTop: 18 },
  p: { fontSize: 15, lineHeight: 23 },
});
