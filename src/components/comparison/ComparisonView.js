import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '../icons/Icon';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../../data/constants';
import { parseAiSummarySections } from '../../utils/aiSummarySections';
import ComparisonRow from './ComparisonRow';
import AppText from '../AppText';
import useComparisonSummary from '../../hooks/useComparisonSummary';
import { COLORS, RADIUS } from '../../theme/fao';

/**
 * @typedef {import('../../database/enrich').Innovation} Innovation
 */

/** Readiness and adoption are both scored 1-9; the bars show them as a share of that. */
const LEVEL_MAX = 9;
const percentOfScale = (level) => (level != null ? Math.round((Number(level) / LEVEL_MAX) * 100) : 0);

const whereFrom = (item) => (item.countries?.length ? item.countries.join(', ') : item.region || '—');

/** Join a list, capped, with an ellipsis standing in for the remainder. */
const joinCapped = (values, max = 3) =>
  values?.length ? values.slice(0, max).join(', ') + (values.length > max ? '…' : '') : '—';

const sdgBadges = (numbers) =>
  numbers?.length
    ? numbers.slice(0, 6).map((number) => ({
        number,
        color: SDGS.find((s) => s.number === number)?.color || COLORS.textMuted,
      }))
    : [];

/**
 * Side-by-side comparison of two bookmarked innovations.
 *
 * Lived inside BookmarksScreen as ~350 lines that had nothing to do with
 * listing bookmarks. Nothing about it is bookmark-specific — it takes two
 * innovations.
 *
 * The two sides were called item1/item2 in code while the UI labelled them A and
 * B, so the code neither matched the screen nor the noun every other module uses
 * for the same object.
 *
 * @param {Innovation} innovationA - rendered on the left, labelled A
 * @param {Innovation} innovationB - rendered on the right, labelled B
 */
export default function ComparisonView({ innovationA, innovationB }) {
  const summary = useComparisonSummary(innovationA, innovationB);

  const readiness1 = READINESS_LEVELS.find((r) => r.level === innovationA.readinessLevel) || READINESS_LEVELS[0];
  const readiness2 = READINESS_LEVELS.find((r) => r.level === innovationB.readinessLevel) || READINESS_LEVELS[0];
  const adoption1 = ADOPTION_LEVELS.find((a) => a.level === innovationA.adoptionLevel) || ADOPTION_LEVELS[0];
  const adoption2 = ADOPTION_LEVELS.find((a) => a.level === innovationB.adoptionLevel) || ADOPTION_LEVELS[0];

  return (
    <View style={styles.root}>
      <View style={styles.titles}>
        <TitleCell label="A" innovation={innovationA} style={styles.colA} />
        <View style={styles.divider} />
        <TitleCell label="B" innovation={innovationB} style={styles.colB} />
      </View>

      <Section title="Summary" icon="document-text-outline">
        <AppText style={styles.poweredByAI}>Powered by AI</AppText>
        <SummaryBody {...summary} />
      </Section>

      <Section title="Readiness & adoption" icon="trending-up-outline">
        <BarRow
          label="Readiness"
          aPercent={percentOfScale(innovationA.readinessLevel)}
          bPercent={percentOfScale(innovationB.readinessLevel)}
          aLabel={readiness1.name}
          bLabel={readiness2.name}
          fillStyle={styles.barFillGreen}
        />
        <BarRow
          label="Adoption"
          aPercent={percentOfScale(innovationA.adoptionLevel)}
          bPercent={percentOfScale(innovationB.adoptionLevel)}
          aLabel={adoption1.name}
          bLabel={adoption2.name}
          fillStyle={styles.barFillBlue}
        />
      </Section>

      <Section title="Location" icon="location-outline">
        <ComparisonRow label="Where" a={whereFrom(innovationA)} b={whereFrom(innovationB)} />
      </Section>

      {(innovationA.types?.length || innovationB.types?.length) > 0 && (
        <Section title="Type & focus" icon="pricetag-outline">
          <ComparisonRow
            label="Types"
            a={joinCapped(innovationA.types, 4)}
            b={joinCapped(innovationB.types, 4)}
            aFull={innovationA.types?.join(', ')}
            bFull={innovationB.types?.join(', ')}
          />
        </Section>
      )}

      {(innovationA.useCases?.length || innovationB.useCases?.length) > 0 && (
        <Section title="Use cases" icon="briefcase-outline">
          <ComparisonRow
            label="Primary"
            a={joinCapped(innovationA.useCases)}
            b={joinCapped(innovationB.useCases)}
            aFull={innovationA.useCases?.join(', ')}
            bFull={innovationB.useCases?.join(', ')}
          />
        </Section>
      )}

      {(innovationA.users?.length || innovationB.users?.length) > 0 && (
        <Section title="User groups" icon="people-outline">
          <ComparisonRow
            label="Intended for"
            a={joinCapped(innovationA.users)}
            b={joinCapped(innovationB.users)}
            aFull={innovationA.users?.join(', ')}
            bFull={innovationB.users?.join(', ')}
          />
        </Section>
      )}

      {(innovationA.sdgs?.length || innovationB.sdgs?.length) > 0 && (
        <Section title="SDG alignment" icon="ribbon-outline">
          <View style={styles.sdgRow}>
            <SdgColumn keyPrefix="1" sdgs={innovationA.sdgs} style={styles.colA} />
            <View style={styles.divider} />
            <SdgColumn keyPrefix="2" sdgs={innovationB.sdgs} style={styles.colB} />
          </View>
        </Section>
      )}

      <Section title="Source" icon="library-outline">
        <ComparisonRow label="Source" a={innovationA.dataSource} b={innovationB.dataSource} />
        <ComparisonRow
          label="Owner / partner"
          a={innovationA.owner || innovationA.partner}
          b={innovationB.owner || innovationB.partner}
        />
      </Section>
    </View>
  );
}

function SummaryBody({ summary, loading, error, retry }) {
  if (loading) {
    return (
      <View style={styles.summaryLoading}>
        <ActivityIndicator size="small" color={COLORS.textMuted} />
        <AppText style={styles.summaryLoadingText}>Generating summary…</AppText>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.summaryErrorBlock}>
        <AppText style={styles.summaryErrorText}>{error}</AppText>
        <TouchableOpacity style={styles.retryBtn} onPress={retry} accessibilityRole="button">
          <AppText style={styles.retryBtnText}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }
  if (!summary) return null;

  return parseAiSummarySections(summary).map((section, index) => (
    <CollapsibleSection
      key={section.title}
      title={section.title}
      content={section.content}
      defaultExpanded={index === 0}
    />
  ));
}

function CollapsibleSection({ title, content, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setExpanded((open) => !open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <AppText style={styles.collapsibleTitle}>{title}</AppText>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      {expanded && <AppText style={styles.collapsibleContent}>{content}</AppText>}
    </View>
  );
}

function Section({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={14} color={COLORS.textMuted} />
        <AppText style={styles.sectionTitle}>{title}</AppText>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function TitleCell({ label, innovation, style }) {
  return (
    <View style={[styles.titleCell, style]}>
      <AppText style={styles.colLabel}>{label}</AppText>
      <View style={styles.titleInner}>
        <AppText style={styles.titleText} numberOfLines={2}>{innovation.title}</AppText>
        {innovation.isGrassroots && (
          <Icon name="leaf-outline" size={16} color={COLORS.eco} style={styles.grassrootsIcon} />
        )}
      </View>
    </View>
  );
}

function BarRow({ label, aPercent, bPercent, aLabel, bLabel, fillStyle }) {
  return (
    <View style={styles.barRow}>
      <AppText style={styles.barLabel}>{label}</AppText>
      <View style={styles.barPair}>
        <Bar percent={aPercent} caption={aLabel} fillStyle={fillStyle} style={styles.colA} />
        <View style={styles.divider} />
        <Bar percent={bPercent} caption={bLabel} fillStyle={fillStyle} style={styles.colB} />
      </View>
    </View>
  );
}

function Bar({ percent, caption, fillStyle, style }) {
  return (
    <View style={[styles.barCell, style]}>
      <View style={styles.barBg}>
        <View style={[fillStyle, { width: `${percent}%` }]} />
      </View>
      <AppText style={styles.barVal} numberOfLines={1}>{caption}</AppText>
    </View>
  );
}

function SdgColumn({ keyPrefix, sdgs, style }) {
  const badges = sdgBadges(sdgs);
  return (
    <View style={[styles.sdgCol, style]}>
      {badges.map(({ number, color }) => (
        <View key={`${keyPrefix}-${number}`} style={[styles.sdgBadge, { backgroundColor: color }]}>
          <AppText style={styles.sdgNum}>{number}</AppText>
        </View>
      ))}
      {badges.length === 0 && <AppText style={styles.muted}>—</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, paddingBottom: 8 },
  colA: { flex: 1, paddingRight: 8 },
  colB: { flex: 1, paddingLeft: 8 },
  divider: { width: 1, backgroundColor: COLORS.border, marginVertical: 2 },
  titles: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceMuted },
  titleCell: { flex: 1, minWidth: 0 },
  colLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4, letterSpacing: 0.5 },
  titleInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  titleText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.textHeading, lineHeight: 20 },
  grassrootsIcon: { marginTop: 2 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  sectionBody: { backgroundColor: COLORS.surfaceSunken, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  poweredByAI: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 8, letterSpacing: 0.3 },
  summaryLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  summaryLoadingText: { fontSize: 13, color: COLORS.textMuted },
  summaryErrorBlock: { marginBottom: 12 },
  summaryErrorText: { fontSize: 13, color: COLORS.danger, marginBottom: 8 },
  retryBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: COLORS.border, borderRadius: 8, alignSelf: 'flex-start' },
  retryBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textBody },
  collapsibleSection: { marginBottom: 12 },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  collapsibleTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textHeading },
  collapsibleContent: { fontSize: 13, color: COLORS.textBody, lineHeight: 20, paddingBottom: 8 },
  barRow: { marginBottom: 12 },
  barLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6 },
  barPair: { flexDirection: 'row' },
  barCell: { flex: 1, minWidth: 0 },
  barBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFillGreen: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  barFillBlue: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  barVal: { fontSize: 10, color: COLORS.textMuted, lineHeight: 14 },
  sdgRow: { flexDirection: 'row', gap: 12 },
  sdgCol: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  sdgBadge: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  sdgNum: { color: COLORS.textInverse, fontSize: 11, fontWeight: '700' },
  muted: { fontSize: 13, color: COLORS.textMuted },
});
