import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  StyleSheet, View, TouchableOpacity, ScrollView,
  Modal, TextInput, LayoutAnimation, useWindowDimensions,
} from 'react-native';
import {
  CHALLENGES, TYPES, USER_GROUPS, READINESS_LEVELS, ADOPTION_LEVELS,
  SDGS, COST_LEVELS, COMPLEXITY_LEVELS,
} from '../data/constants';
import { AccessibilityContext } from '../context/AccessibilityContext';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import { FILTER_CATEGORY_COLORS } from '../utils/activeFilterTags';

import AppText from './AppText';
import TaxonomySection from './filters/TaxonomySection';
import useTaxonomySelection from './filters/useTaxonomySelection';
import useFilterOptions from '../hooks/useFilterOptions';
import LevelSlider from './filters/LevelSlider';
import ChipMultiSelect, { ChipRow } from './filters/ChipMultiSelect';

/**
 * @typedef {import('../database/db').InnovationFilters} InnovationFilters
 */

/**
 * The ten filter fields that are plain values rather than taxonomy selections.
 *
 * Held as one object because this mapping used to be spelled out three times —
 * as lazy useState initialisers, in the initialFilters effect, and again in
 * handleReset — so adding a filter category meant editing all three and there
 * was nothing to notice if you edited two.
 *
 * @param {object} [bag] - a filter bag, or nothing for the defaults
 */
function draftFromBag(bag = {}) {
  return {
    readinessMin: bag.readinessMin || 1,
    adoptionMin: bag.adoptionMin || 1,
    hubRegions: bag.hubRegions || [],
    countries: bag.countries || [],
    userGroups: bag.userGroups || [],
    cost: bag.cost || [],
    complexity: bag.complexity || [],
    sdgs: bag.sdgs || [],
    sources: bag.sources || [],
    grassrootsOnly: bag.grassrootsOnly || false,
  };
}

/**
 * The filter sheet.
 *
 * @param {boolean} visible
 * @param {() => void} onClose
 * @param {(filters: InnovationFilters) => void} onApply - called with the whole
 *   bag on Done; dismissing the sheet applies too, since there is no cancel
 * @param {InnovationFilters} [initialFilters] - what the panel opens showing
 * @param {InnovationFilters} [entryFilters] - the slice the user is already
 *   inside, restored by Reset rather than cleared
 */
export default function FilterPanel({ visible, onClose, onApply, initialFilters, entryFilters }) {
  // Read at render rather than frozen at import, so the panel is sized
  // correctly after a rotation.
  const { height: screenHeight } = useWindowDimensions();
  const { reduceMotion } = useContext(AccessibilityContext);

  /** Staged before a taxonomy change so expanding a section animates. */
  const stageLayoutAnimation = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [reduceMotion]);

  const challenges = useTaxonomySelection(
    CHALLENGES,
    initialFilters?.challengeKeywords,
    stageLayoutAnimation
  );
  const types = useTaxonomySelection(
    TYPES,
    initialFilters?.typeKeywords,
    stageLayoutAnimation
  );

  const [draft, setDraft] = useState(() => draftFromBag(initialFilters));
  const setField = useCallback(
    (field, value) => setDraft((prev) => ({ ...prev, [field]: value })),
    []
  );

  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDD, setShowCountryDD] = useState(false);
  const { allCountries, dataSources } = useFilterOptions();

  const { restore: restoreChallenges } = challenges;
  const { restore: restoreTypes } = types;
  useEffect(() => {
    if (!initialFilters) return;
    restoreChallenges(initialFilters.challengeKeywords);
    restoreTypes(initialFilters.typeKeywords);
    setDraft(draftFromBag(initialFilters));
  }, [initialFilters, restoreChallenges, restoreTypes]);

  const toggleField = (field, item) => {
    const list = draft[field];
    setField(field, list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const filteredCountries = allCountries.filter(
    c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) && !draft.countries.includes(c.name)
  ).slice(0, 8);

  const handleApply = () => {
    const challengeKeywords = challenges.keywordsForApply();
    const typeKeywords = types.keywordsForApply();
    onApply({
      challengeKeywords: challengeKeywords.length > 0 ? challengeKeywords : undefined,
      typeKeywords: typeKeywords.length > 0 ? typeKeywords : undefined,
      ...draft,
    });
    onClose();
  };

  /**
   * Back to the filters this panel was opened with, not to nothing: a drilldown
   * has entry filters that define the slice the user is inside, so clearing
   * those would silently widen the results they are looking at.
   */
  const handleReset = () => {
    const entry = entryFilters || {};
    challenges.restore(entry.challengeKeywords);
    types.restore(entry.typeKeywords);
    setDraft(draftFromBag({ hubRegions: entry.hubRegions }));
  };


  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={handleApply}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={handleApply}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Apply filters and close"
        />
        <View style={[styles.panel, { maxHeight: screenHeight * 0.9 }]}>
          <View style={styles.header}>
            <AppText style={styles.headerTitle}>Filter solutions</AppText>
            <TouchableOpacity
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="Done, apply filters"
            >
              <AppText style={styles.doneBtn}>Done</AppText>
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.content, { maxHeight: screenHeight * 0.65 }]} showsVerticalScrollIndicator={true}>
            <TaxonomySection title="What's the challenge?" {...challenges.sectionProps} />

            <TaxonomySection title="What kind of solution?" {...types.sectionProps} />

            <LevelSlider
              title="How ready is it?"
              levels={READINESS_LEVELS}
              value={draft.readinessMin}
              onChange={(v) => setField('readinessMin', v)}
              color={FILTER_CATEGORY_COLORS.readiness}
              captions={['Idea', 'Working', 'Ready']}
            />

            <LevelSlider
              title="How widely adopted?"
              levels={ADOPTION_LEVELS}
              value={draft.adoptionMin}
              onChange={(v) => setField('adoptionMin', v)}
              color={FILTER_CATEGORY_COLORS.adoption}
              captions={['Project', 'Network', 'Livelihood']}
            />

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Where?</AppText>
              <ChipRow
                options={INNOVATION_HUB_REGIONS}
                getValue={(r) => r.id}
                getLabel={(r) => r.name}
                selected={draft.hubRegions}
                onToggle={(value) => toggleField('hubRegions', value)}
                color={FILTER_CATEGORY_COLORS.region}
                getColor={(r) => r.iconColor || FILTER_CATEGORY_COLORS.region}
              />
              <AppText style={[styles.sectionTitle, { marginTop: 12, fontSize: 12 }]}>Search specific country</AppText>
              <TextInput
                style={styles.countryInput}
                placeholder="Search country..."
                value={countrySearch}
                onChangeText={(t) => { setCountrySearch(t); setShowCountryDD(t.length > 0); }}
              />
              {showCountryDD && filteredCountries.length > 0 && (
                <View style={styles.countryDD}>
                  {filteredCountries.map(c => (
                    <TouchableOpacity
                      key={c.name}
                      style={styles.countryDDItem}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${c.name}, ${c.count} solutions`}
                      onPress={() => {
                        setField('countries', [...draft.countries, c.name]);
                        setCountrySearch('');
                        setShowCountryDD(false);
                      }}
                    >
                      <AppText style={styles.countryDDText}>{c.name}</AppText>
                      <AppText style={styles.countryDDCount}>{c.count}</AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {draft.countries.length > 0 && (
                <View style={styles.chipRow}>
                  {draft.countries.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.countryChip, { borderColor: FILTER_CATEGORY_COLORS.country, backgroundColor: FILTER_CATEGORY_COLORS.country + '18' }]}
                      onPress={() => setField('countries', draft.countries.filter(x => x !== c))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${c}`}
                    >
                      <AppText style={[styles.countryChipText, { color: FILTER_CATEGORY_COLORS.country }]}>{c} ×</AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <ChipMultiSelect
              title="Who's it for?"
              options={USER_GROUPS}
              getValue={(u) => u.value}
              getLabel={(u) => u.name}
              selected={draft.userGroups}
              onToggle={(value) => toggleField('userGroups', value)}
              color={FILTER_CATEGORY_COLORS.userGroup}
            />

            <ChipMultiSelect
              title="Cost"
              options={COST_LEVELS}
              getValue={(c) => c.value}
              getLabel={(c) => c.label}
              selected={draft.cost}
              onToggle={(value) => toggleField('cost', value)}
              getColor={(c) => FILTER_CATEGORY_COLORS.cost[c.value] || FILTER_CATEGORY_COLORS.cost.med}
            />

            <ChipMultiSelect
              title="Complexity"
              options={COMPLEXITY_LEVELS}
              getValue={(c) => c.value}
              getLabel={(c) => c.label}
              selected={draft.complexity}
              onToggle={(value) => toggleField('complexity', value)}
              getColor={(c) => FILTER_CATEGORY_COLORS.complexity[c.value] || FILTER_CATEGORY_COLORS.complexity.moderate}
            />

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>SDG impact</AppText>
              <View style={styles.sdgGrid}>
                {SDGS.map(s => (
                  <TouchableOpacity
                    key={s.number}
                    accessibilityRole="button"
                    accessibilityLabel={`Sustainable Development Goal ${s.number}`}
                    accessibilityState={{ selected: draft.sdgs.includes(s.number) }}
                    style={[
                      styles.sdgChip,
                      { backgroundColor: s.color },
                      draft.sdgs.includes(s.number) && styles.sdgChipOn,
                    ]}
                    onPress={() => toggleField('sdgs', s.number)}
                  >
                    <AppText style={styles.sdgChipText}>{s.number}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
              {draft.sdgs.length > 0 && (
                <View style={styles.sdgSelectedSummary}>
                  {SDGS.filter(s => draft.sdgs.includes(s.number))
                    .sort((a, b) => a.number - b.number)
                    .map(s => (
                      <View key={s.number} style={styles.sdgSummaryChip}>
                        <AppText style={styles.sdgSelectedSummaryText}>
                          {s.number}. {s.name}
                        </AppText>
                      </View>
                    ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Data source</AppText>
              <View style={styles.chipRow}>
                {dataSources.map(s => {
                  const on = draft.sources.includes(s.title);
                  const color = FILTER_CATEGORY_COLORS.source;
                  return (
                    <TouchableOpacity
                      key={s.title}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleField('sources', s.title)}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.title}, ${s.count} solutions`}
                      accessibilityState={{ selected: on }}
                    >
                      <AppText style={[styles.chipText, on && { color: '#fff' }]}>
                        {s.title} ({s.count})
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Grassroots</AppText>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setField('grassrootsOnly', !draft.grassrootsOnly)}
                accessibilityRole="switch"
                accessibilityLabel="Only grassroots solutions"
                accessibilityState={{ checked: draft.grassrootsOnly }}
              >
                <AppText style={styles.toggleLabel}>Only grassroots solutions</AppText>
                <View style={[styles.toggle, draft.grassrootsOnly && { backgroundColor: FILTER_CATEGORY_COLORS.grassroots }]}>
                  <View style={[styles.toggleKnob, draft.grassrootsOnly && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="Show results"
            >
              <AppText style={styles.applyBtnText}>Show results</AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
            >
              <AppText style={styles.resetBtnText}>Reset all</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  panel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  doneBtn: { fontSize: 14, fontWeight: '600', color: '#555' },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  section: { marginBottom: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 12, color: '#111' },
  countryInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 10, fontSize: 12, marginTop: 10, marginBottom: 10 },
  countryDD: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, maxHeight: 150, marginBottom: 10 },
  countryDDItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  countryDDText: { fontSize: 12 },
  countryDDCount: { fontSize: 10, color: '#999' },
  countryChip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  countryChipText: { fontSize: 11, color: '#555' },
  sdgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sdgChip: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  sdgChipOn: { borderColor: '#030213', transform: [{ scale: 1.05 }] },
  sdgChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sdgSelectedSummary: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sdgSummaryChip: { backgroundColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sdgSelectedSummaryText: { fontSize: 10, color: '#666', textAlign: 'left' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 12 },
  toggle: { width: 44, height: 24, backgroundColor: '#e5e7eb', borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleKnob: { width: 20, height: 20, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleKnobOn: { alignSelf: 'flex-end' },
  footer: { flexDirection: 'row', padding: 12, paddingHorizontal: 20, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 10 },
  applyBtn: { flex: 2, backgroundColor: '#030213', borderRadius: 12, padding: 14, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resetBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, alignItems: 'center' },
  resetBtnText: { color: '#555', fontWeight: '500', fontSize: 13 },
});
