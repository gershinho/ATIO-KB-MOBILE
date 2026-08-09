import React, { useState, useEffect, useContext } from 'react';
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
import { getAllCountries, getDataSources } from '../database/db';
import {
  entryIdsForKeywords, keywordsByEntryId, keywordsForEntries,
} from '../utils/filterEncoding';
import { createLogger } from '../utils/logger';
import AppText from './AppText';
import TaxonomySection from './filters/TaxonomySection';

const log = createLogger('filters');

/**
 * Challenges and Types have the same shape — {id, name, icon, iconColor,
 * subTerms:[{keyword,label}]} — and every consumer here treats them
 * identically, so the translation helpers take the taxonomy as an argument.
 * They now live in utils/filterEncoding.js alongside the id-to-keyword
 * direction, which is the same translation read the other way.
 */

export default function FilterPanel({ visible, onClose, onApply, initialFilters, entryFilters }) {
  // Read at render rather than frozen at import, so the panel is sized
  // correctly after a rotation.
  const { height: screenHeight } = useWindowDimensions();
  const { reduceMotion } = useContext(AccessibilityContext);
  const [expandedChallenge, setExpandedChallenge] = useState(null);
  const [selectedSubTerms, setSelectedSubTerms] = useState(() =>
    keywordsByEntryId(CHALLENGES, initialFilters?.challengeKeywords)
  );
  const [challengesInScope, setChallengesInScope] = useState(() =>
    entryIdsForKeywords(CHALLENGES, initialFilters?.challengeKeywords)
  );
  const [expandedType, setExpandedType] = useState(null);
  const [selectedTypeSubTerms, setSelectedTypeSubTerms] = useState(() =>
    keywordsByEntryId(TYPES, initialFilters?.typeKeywords)
  );
  const [typesInScope, setTypesInScope] = useState(() =>
    entryIdsForKeywords(TYPES, initialFilters?.typeKeywords)
  );
  const [readinessMin, setReadinessMin] = useState(initialFilters?.readinessMin || 1);
  const [adoptionMin, setAdoptionMin] = useState(initialFilters?.adoptionMin || 1);
  const [hubRegions, setHubRegions] = useState(initialFilters?.hubRegions || []);
  const [countries, setCountries] = useState(initialFilters?.countries || []);
  const [userGroups, setUserGroups] = useState(initialFilters?.userGroups || []);
  const [cost, setCost] = useState(initialFilters?.cost || []);
  const [complexity, setComplexity] = useState(initialFilters?.complexity || []);
  const [sdgs, setSdgs] = useState(initialFilters?.sdgs || []);
  const [sources, setSources] = useState(initialFilters?.sources || []);
  const [grassrootsOnly, setGrassrootsOnly] = useState(initialFilters?.grassrootsOnly || false);

  const [countrySearch, setCountrySearch] = useState('');
  const [allCountries, setAllCountries] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [showCountryDD, setShowCountryDD] = useState(false);

  useEffect(() => {
    if (visible) {
      loadCountries();
      loadSources();
    }
  }, [visible]);

  useEffect(() => {
    if (initialFilters) {
      setSelectedSubTerms(keywordsByEntryId(CHALLENGES, initialFilters.challengeKeywords));
      setChallengesInScope(entryIdsForKeywords(CHALLENGES, initialFilters.challengeKeywords));
      setExpandedChallenge(null);
      setSelectedTypeSubTerms(keywordsByEntryId(TYPES, initialFilters.typeKeywords));
      setTypesInScope(entryIdsForKeywords(TYPES, initialFilters.typeKeywords));
      setExpandedType(null);
      setReadinessMin(initialFilters.readinessMin || 1);
      setAdoptionMin(initialFilters.adoptionMin || 1);
      setHubRegions(initialFilters.hubRegions || []);
      setCountries(initialFilters.countries || []);
      setUserGroups(initialFilters.userGroups || []);
      setCost(initialFilters.cost || []);
      setComplexity(initialFilters.complexity || []);
      setSdgs(initialFilters.sdgs || []);
      setSources(initialFilters.sources || []);
      setGrassrootsOnly(initialFilters.grassrootsOnly || false);
    }
  }, [initialFilters]);

  const loadCountries = async () => {
    try {
      const c = await getAllCountries();
      setAllCountries(c);
    } catch (e) { log.degraded('Country list unavailable; that filter will be empty:', e); }
  };

  const loadSources = async () => {
    try {
      const s = await getDataSources();
      setDataSources(s);
    } catch (e) { log.degraded('Source list unavailable; that filter will be empty:', e); }
  };

  const toggleItem = (list, setList, item) => {
    if (list.includes(item)) {
      setList(list.filter(x => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const toggleSubTerm = (challengeId, keyword) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedSubTerms(prev => {
      const arr = prev[challengeId] || [];
      const has = arr.includes(keyword);
      const next = { ...prev };
      if (has) {
        next[challengeId] = arr.filter(k => k !== keyword);
        if (next[challengeId].length === 0) delete next[challengeId];
      } else {
        next[challengeId] = [...arr, keyword];
      }
      return next;
    });
  };

  const expandChallenge = (id) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChallengesInScope(prev => (prev.includes(id) ? prev : [...prev, id]));
    setExpandedChallenge(id);
  };

  const collapseChallenge = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedChallenge(null);
  };

  const clearChallengeAndCollapse = (id) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChallengesInScope(prev => prev.filter(x => x !== id));
    setSelectedSubTerms(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedChallenge(null);
  };

  const toggleTypeSubTerm = (typeId, keyword) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTypeSubTerms(prev => {
      const arr = prev[typeId] || [];
      const has = arr.includes(keyword);
      const next = { ...prev };
      if (has) {
        next[typeId] = arr.filter(k => k !== keyword);
        if (next[typeId].length === 0) delete next[typeId];
      } else {
        next[typeId] = [...arr, keyword];
      }
      return next;
    });
  };

  const expandType = (id) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTypesInScope(prev => (prev.includes(id) ? prev : [...prev, id]));
    setExpandedType(id);
  };

  const collapseType = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedType(null);
  };

  const clearTypeAndCollapse = (id) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTypesInScope(prev => prev.filter(x => x !== id));
    setSelectedTypeSubTerms(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedType(null);
  };

  const filteredCountries = allCountries.filter(
    c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) && !countries.includes(c.name)
  ).slice(0, 8);

  const getChallengeKeywordsForApply = () =>
    keywordsForEntries(CHALLENGES, challengesInScope, selectedSubTerms);

  const getTypeKeywordsForApply = () =>
    keywordsForEntries(TYPES, typesInScope, selectedTypeSubTerms);

  const handleApply = () => {
    const challengeKeywords = getChallengeKeywordsForApply();
    const typeKeywords = getTypeKeywordsForApply();
    onApply({
      challengeKeywords: challengeKeywords.length > 0 ? challengeKeywords : undefined,
      typeKeywords: typeKeywords.length > 0 ? typeKeywords : undefined,
      readinessMin, adoptionMin, hubRegions,
      countries, userGroups, cost, complexity, sdgs, sources, grassrootsOnly,
    });
    onClose();
  };

  const handleReset = () => {
    const entry = entryFilters || {};
    setSelectedSubTerms(keywordsByEntryId(CHALLENGES, entry.challengeKeywords));
    setChallengesInScope(entryIdsForKeywords(CHALLENGES, entry.challengeKeywords));
    setExpandedChallenge(null);
    setSelectedTypeSubTerms(keywordsByEntryId(TYPES, entry.typeKeywords));
    setTypesInScope(entryIdsForKeywords(TYPES, entry.typeKeywords));
    setExpandedType(null);
    setReadinessMin(1);
    setAdoptionMin(1);
    setHubRegions(entry.hubRegions || []);
    setCountries([]);
    setUserGroups([]);
    setCost([]);
    setComplexity([]);
    setSdgs([]);
    setSources([]);
    setGrassrootsOnly(false);
  };

  const rdyInfo = READINESS_LEVELS[readinessMin - 1];
  const adpInfo = ADOPTION_LEVELS[adoptionMin - 1];

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={handleApply}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={handleApply} activeOpacity={1} />
        <View style={[styles.panel, { maxHeight: screenHeight * 0.9 }]}>
          <View style={styles.header}>
            <AppText style={styles.headerTitle}>Filter solutions</AppText>
            <TouchableOpacity onPress={handleApply}>
              <AppText style={styles.doneBtn}>Done</AppText>
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.content, { maxHeight: screenHeight * 0.65 }]} showsVerticalScrollIndicator={true}>
            <TaxonomySection
              title="What's the challenge?"
              taxonomy={CHALLENGES}
              inScopeIds={challengesInScope}
              selectedSubTerms={selectedSubTerms}
              expandedId={expandedChallenge}
              onExpand={expandChallenge}
              onCollapse={collapseChallenge}
              onClearEntry={clearChallengeAndCollapse}
              onToggleSubTerm={toggleSubTerm}
            />

            <TaxonomySection
              title="What kind of solution?"
              taxonomy={TYPES}
              inScopeIds={typesInScope}
              selectedSubTerms={selectedTypeSubTerms}
              expandedId={expandedType}
              onExpand={expandType}
              onCollapse={collapseType}
              onClearEntry={clearTypeAndCollapse}
              onToggleSubTerm={toggleTypeSubTerm}
            />

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>How ready is it?</AppText>
              <View style={styles.sliderRow}>
                {READINESS_LEVELS.map(r => (
                  <TouchableOpacity
                    key={r.level}
                    style={[styles.sliderDot, readinessMin <= r.level && { backgroundColor: FILTER_CATEGORY_COLORS.readiness }]}
                    onPress={() => setReadinessMin(r.level)}
                  >
                    <AppText style={[styles.sliderDotText, readinessMin <= r.level && { color: '#fff' }]}>
                      {r.level}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderLabels}>
                <AppText style={styles.sliderLabel}>Idea</AppText>
                <AppText style={styles.sliderLabel}>Working</AppText>
                <AppText style={styles.sliderLabel}>Ready</AppText>
              </View>
              <View style={styles.sliderInfo}>
                <AppText style={styles.sliderInfoTitle}>{rdyInfo.name} ({readinessMin})</AppText>
                <AppText style={styles.sliderInfoDesc}>{rdyInfo.description}</AppText>
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>How widely adopted?</AppText>
              <View style={styles.sliderRow}>
                {ADOPTION_LEVELS.map(a => (
                  <TouchableOpacity
                    key={a.level}
                    style={[styles.sliderDot, adoptionMin <= a.level && { backgroundColor: FILTER_CATEGORY_COLORS.adoption }]}
                    onPress={() => setAdoptionMin(a.level)}
                  >
                    <AppText style={[styles.sliderDotText, adoptionMin <= a.level && { color: '#fff' }]}>
                      {a.level}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderLabels}>
                <AppText style={styles.sliderLabel}>Project</AppText>
                <AppText style={styles.sliderLabel}>Network</AppText>
                <AppText style={styles.sliderLabel}>Livelihood</AppText>
              </View>
              <View style={styles.sliderInfo}>
                <AppText style={styles.sliderInfoTitle}>{adpInfo.name} ({adoptionMin})</AppText>
                <AppText style={styles.sliderInfoDesc}>{adpInfo.description}</AppText>
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Where?</AppText>
              <View style={styles.chipRow}>
                {INNOVATION_HUB_REGIONS.map(r => {
                  const on = hubRegions.includes(r.id);
                  const color = r.iconColor || FILTER_CATEGORY_COLORS.region;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(hubRegions, setHubRegions, r.id)}
                    >
                      <AppText style={[styles.chipText, on && { color: '#fff' }]} numberOfLines={1}>
                        {r.name}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                      onPress={() => {
                        setCountries([...countries, c.name]);
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
              {countries.length > 0 && (
                <View style={styles.chipRow}>
                  {countries.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.countryChip, { borderColor: FILTER_CATEGORY_COLORS.country, backgroundColor: FILTER_CATEGORY_COLORS.country + '18' }]}
                      onPress={() => setCountries(countries.filter(x => x !== c))}
                    >
                      <AppText style={[styles.countryChipText, { color: FILTER_CATEGORY_COLORS.country }]}>{c} ×</AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Who's it for?</AppText>
              <View style={styles.chipRow}>
                {USER_GROUPS.map(u => {
                  const on = userGroups.includes(u.value);
                  const color = FILTER_CATEGORY_COLORS.userGroup;
                  return (
                    <TouchableOpacity
                      key={u.value}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(userGroups, setUserGroups, u.value)}
                    >
                      <AppText style={[styles.chipText, on && { color: '#fff' }]}>
                        {u.name}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Cost</AppText>
              <View style={styles.chipRow}>
                {COST_LEVELS.map(c => {
                  const on = cost.includes(c.value);
                  const color = FILTER_CATEGORY_COLORS.cost[c.value] || FILTER_CATEGORY_COLORS.cost.med;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(cost, setCost, c.value)}
                    >
                      <AppText style={[styles.chipText, on && { color: '#fff' }]}>
                        {c.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Complexity</AppText>
              <View style={styles.chipRow}>
                {COMPLEXITY_LEVELS.map(c => {
                  const on = complexity.includes(c.value);
                  const color = FILTER_CATEGORY_COLORS.complexity[c.value] || FILTER_CATEGORY_COLORS.complexity.moderate;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(complexity, setComplexity, c.value)}
                    >
                      <AppText style={[styles.chipText, on && { color: '#fff' }]}>
                        {c.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>SDG impact</AppText>
              <View style={styles.sdgGrid}>
                {SDGS.map(s => (
                  <TouchableOpacity
                    key={s.number}
                    style={[
                      styles.sdgChip,
                      { backgroundColor: s.color },
                      sdgs.includes(s.number) && styles.sdgChipOn,
                    ]}
                    onPress={() => toggleItem(sdgs, setSdgs, s.number)}
                  >
                    <AppText style={styles.sdgChipText}>{s.number}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
              {sdgs.length > 0 && (
                <View style={styles.sdgSelectedSummary}>
                  {SDGS.filter(s => sdgs.includes(s.number))
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
                  const on = sources.includes(s.title);
                  const color = FILTER_CATEGORY_COLORS.source;
                  return (
                    <TouchableOpacity
                      key={s.title}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(sources, setSources, s.title)}
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
                onPress={() => setGrassrootsOnly(!grassrootsOnly)}
              >
                <AppText style={styles.toggleLabel}>Only grassroots solutions</AppText>
                <View style={[styles.toggle, grassrootsOnly && { backgroundColor: FILTER_CATEGORY_COLORS.grassroots }]}>
                  <View style={[styles.toggleKnob, grassrootsOnly && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <AppText style={styles.applyBtnText}>Show results</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
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
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f3f3', alignItems: 'center', justifyContent: 'center' },
  sliderDotText: { fontSize: 11, fontWeight: '600', color: '#555' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderLabel: { fontSize: 9, color: '#999' },
  sliderInfo: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 10 },
  sliderInfoTitle: { fontWeight: '600', fontSize: 11, marginBottom: 4 },
  sliderInfoDesc: { fontSize: 10, color: '#999', lineHeight: 14 },
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
