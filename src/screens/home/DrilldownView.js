import React, { useContext, useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import Icon from '../../components/icons/Icon';
import { AccessibilityContext } from '../../context/AccessibilityContext';
import FilterPanel from '../../components/FilterPanel';
import HelpEmptyState from '../../components/HelpEmptyState';
import ResultsList from '../../components/ResultsList';
import InteractiveInnovationCard from '../../components/InteractiveInnovationCard';
import { getActiveFilterTags, getFiltersAfterRemove } from '../../utils/activeFilterTags';
import { withExpandedKeywords } from '../../utils/filterEncoding';
import AppText from '../../components/AppText';
import { COLORS, RADIUS } from '../../theme/fao';

/**
 * @typedef {import('../../hooks/useInnovationInteractions').InnovationInteractions} InnovationInteractions
 */


/**
 * A filtered slice of the catalogue — everything reached by tapping a challenge,
 * a type, a hub, a heat map cell, or "browse all".
 *
 * Presentational; `drilldown` is the useDrilldown hook's return value.
 *
 * @param {object} drilldown - the useDrilldown return value
 * @param {InnovationInteractions} interactions
 * @param {{items: Array, loading: boolean}} help - hotlines for the empty state
 * @param {() => void} onBack
 */
export default function DrilldownView({ drilldown, interactions, help, onBack }) {
  const { colorBlindMode } = useContext(AccessibilityContext);
  const [filterVisible, setFilterVisible] = useState(false);

  const panelInitialFilters = useMemo(
    () => withExpandedKeywords(drilldown.filters),
    [drilldown.filters]
  );

  const filterTags = getActiveFilterTags(drilldown.filters, { colorBlindMode });

  const renderCard = (item) => (
    <InteractiveInnovationCard item={item} interactions={interactions} />
  );

  // A challenge drilldown shows a bare number because its header already reads
  // as a count of that challenge; everything else spells out the noun.
  const countLabel = drilldown.loading
    ? '…'
    : drilldown.source === 'challenge'
      ? drilldown.count.toLocaleString()
      : `${drilldown.count.toLocaleString()} solution${drilldown.count === 1 ? '' : 's'}`;

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          accessibilityLabel="Back to Explore"
          accessibilityRole="button"
        >
          <Icon name="arrow-back" size={24} color={COLORS.textBody} />
        </TouchableOpacity>
        {drilldown.icon ? (
          <View style={[styles.headerIconWrap, { backgroundColor: `${drilldown.iconColor}20` }]}>
            <Icon name={drilldown.icon} size={24} color={drilldown.iconColor} />
          </View>
        ) : null}
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {drilldown.title}
          </AppText>
          <AppText style={styles.headerCount}>{countLabel}</AppText>
        </View>
        <TouchableOpacity
          style={styles.headerSliders}
          onPress={() => setFilterVisible(true)}
          accessibilityLabel="Filters"
          accessibilityRole="button"
        >
          <Icon name="options-outline" size={24} color={COLORS.textBody} />
        </TouchableOpacity>
      </View>

      <FilterPanel
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        onApply={(filters) => { drilldown.applyFilters(filters); setFilterVisible(false); }}
        initialFilters={panelInitialFilters}
        entryFilters={drilldown.entryFilters}
      />

      {filterTags.length > 0 && (
        <View style={styles.filterChipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterChipsScroll}
            contentContainerStyle={styles.filterChipsContent}
          >
            {filterTags.map((tag) => (
              <TouchableOpacity
                key={tag.id}
                style={[styles.filterChip, { backgroundColor: `${tag.color}22`, borderColor: tag.color }]}
                onPress={() => drilldown.applyFilters(getFiltersAfterRemove(drilldown.filters, tag))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${tag.label}`}
              >
                <AppText style={[styles.filterChipText, { color: tag.color }]} numberOfLines={1}>
                  {tag.label}
                </AppText>
                <Icon name="close-circle" size={16} color={tag.color} style={styles.filterChipClose} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {drilldown.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.textHeading} />
        </View>
      ) : drilldown.error ? (
        <View style={styles.errorWrap}>
          <Icon name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
          <AppText style={styles.errorText}>{drilldown.error}</AppText>
        </View>
      ) : (
        <ResultsList
          data={drilldown.results}
          renderCard={renderCard}
          contentStyle={styles.listContent}
          loadingMore={drilldown.loadingMore}
          onEndReached={drilldown.loadMore}
          emptyState={
            <HelpEmptyState
              title="No solutions found"
              subtitle="We couldn't find any solutions in this category. Below are hotlines and helplines that may help."
              loading={help.loading}
              items={help.items}
              isBookmarked={interactions.isBookmarked}
              onExpand={(item) => interactions.openDrawer(item, true)}
              onToggleBookmark={interactions.toggleBookmark}
            />
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 16, gap: 8, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8, marginRight: 4 },
  headerSliders: { padding: 8, marginRight: -8 },
  headerIconWrap: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textHeading },
  headerCount: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  filterChipsWrap: { minHeight: 44, flexShrink: 0, backgroundColor: COLORS.surface, paddingVertical: 8, marginBottom: 4 },
  filterChipsScroll: { flexGrow: 0 },
  filterChipsContent: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', paddingVertical: 2, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingLeft: 10, paddingVertical: 6, paddingRight: 6, marginRight: 6, maxWidth: 160, minHeight: 32 },
  filterChipText: { fontSize: 12, fontWeight: '600', flex: 1 },
  filterChipClose: { marginLeft: 4 },
  listContent: { padding: 20, paddingBottom: 100 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  errorText: { fontSize: 13, textAlign: 'center', color: COLORS.textBody, lineHeight: 20 },
});
