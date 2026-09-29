import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from '../AppText';
import { COLORS } from '../../theme/fao';

/**
 * One taxonomy picker: a row of entry chips that drills into an entry's
 * sub-terms when tapped.
 *
 * Challenges and solution types have identical shapes — {id, name, iconColor,
 * subTerms:[{keyword,label}]} — and FilterPanel rendered them with two copies
 * of this 71-line block that differed only in which constant they read and
 * which state slots they touched. The copies had already drifted in their
 * badge-count logic.
 *
 * @param {string} title
 * @param {Array} taxonomy - CHALLENGES or TYPES
 * @param {string[]} inScopeIds - entries counted as selected
 * @param {Record<string, string[]>} selectedSubTerms - checked keywords per entry
 * @param {string|null} expandedId - entry currently drilled into
 * @param {(id: string) => void} onExpand
 * @param {() => void} onCollapse
 * @param {(id: string) => void} onClearEntry - clear the entry and step back out
 * @param {(id: string, keyword: string) => void} onToggleSubTerm
 */
export default function TaxonomySection({
  title,
  taxonomy,
  inScopeIds,
  selectedSubTerms,
  expandedId,
  onExpand,
  onCollapse,
  onClearEntry,
  onToggleSubTerm,
}) {
  const expandedEntry = expandedId != null ? taxonomy.find((e) => e.id === expandedId) : null;

  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {expandedEntry ? (
        <TouchableOpacity
          style={styles.drillDownArea}
          onPress={onCollapse}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Collapse this category"
        >
          <AppText style={styles.backLink}>← Back to all</AppText>
          <ExpandedEntry
            entry={expandedEntry}
            selectedKeywords={selectedSubTerms[expandedEntry.id] || []}
            onClear={() => onClearEntry(expandedEntry.id)}
            onToggleSubTerm={onToggleSubTerm}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.chipRow}>
          {taxonomy.map((entry) => (
            <EntryChip
              key={entry.id}
              entry={entry}
              inScope={inScopeIds.includes(entry.id)}
              selectedKeywords={selectedSubTerms[entry.id]}
              onPress={() => onExpand(entry.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The badge counts what is actually selected: the checked sub-terms if any are,
 * otherwise every sub-term when the whole entry is in scope, otherwise nothing.
 */
function EntryChip({ entry, inScope, selectedKeywords, onPress }) {
  const count = selectedKeywords?.length > 0
    ? selectedKeywords.length
    : (inScope ? (entry.subTerms || []).length : 0);
  const color = entry.iconColor || COLORS.textBody;

  return (
    <TouchableOpacity
      style={[styles.chip, styles.chipWithBadge]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${entry.name}, ${count} selected` : entry.name}
    >
      <AppText style={styles.chipText}>{entry.name}</AppText>
      {count > 0 && (
        <View style={[styles.chipBadge, { backgroundColor: color }]}>
          <AppText style={styles.chipBadgeText}>{count}</AppText>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ExpandedEntry({ entry, selectedKeywords, onClear, onToggleSubTerm }) {
  const color = entry.iconColor || COLORS.textBody;
  return (
    <>
      <TouchableOpacity
        style={[styles.expandedChip, { backgroundColor: color }]}
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={`Clear ${entry.name}`}
      >
        <AppText style={styles.expandedChipText}>{entry.name}</AppText>
      </TouchableOpacity>
      <View style={styles.subTermRow}>
        {(entry.subTerms || []).map((subTerm) => {
          const selected = selectedKeywords.includes(subTerm.keyword);
          return (
            <TouchableOpacity
              key={subTerm.keyword}
              style={[styles.subTermChip, selected && { backgroundColor: color, borderColor: color }]}
              onPress={() => onToggleSubTerm(entry.id, subTerm.keyword)}
              accessibilityRole="button"
              accessibilityLabel={subTerm.label}
              accessibilityState={{ selected }}
            >
              <AppText style={[styles.subTermChipText, selected && styles.subTermChipTextSelected]}>
                {subTerm.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12, color: COLORS.textHeading },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, color: COLORS.textBody },
  chipBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chipBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.textInverse },
  drillDownArea: { paddingTop: 4 },
  backLink: { fontSize: 13, color: COLORS.primary, marginBottom: 12 },
  expandedChip: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, marginBottom: 12 },
  expandedChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textInverse },
  subTermRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subTermChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  subTermChipText: { fontSize: 12, color: COLORS.textBody },
  subTermChipTextSelected: { color: COLORS.textInverse },
});
