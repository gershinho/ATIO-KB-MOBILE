import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Modal, TextInput, Dimensions,
} from 'react-native';
import {
  CHALLENGES, TYPES, REGIONS, USER_GROUPS, READINESS_LEVELS, ADOPTION_LEVELS,
  SDGS, COST_LEVELS, COMPLEXITY_LEVELS,
} from '../data/constants';
import { FILTER_CATEGORY_COLORS } from '../utils/activeFilterTags';
import { getAllCountries, getDataSources } from '../database/db';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FilterPanel({ visible, onClose, onApply, initialFilters }) {
  const [challenges, setChallenges] = useState(initialFilters?.challenges || []);
  const [types, setTypes] = useState(initialFilters?.types || []);
  const [readinessMin, setReadinessMin] = useState(initialFilters?.readinessMin || 1);
  const [adoptionMin, setAdoptionMin] = useState(initialFilters?.adoptionMin || 1);
  const [regions, setRegions] = useState(initialFilters?.regions || []);
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
      setChallenges(initialFilters.challenges || []);
      setTypes(initialFilters.types || []);
      setReadinessMin(initialFilters.readinessMin || 1);
      setAdoptionMin(initialFilters.adoptionMin || 1);
      setRegions(initialFilters.regions || []);
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
    } catch (e) { console.log('Error loading countries:', e); }
  };

  const loadSources = async () => {
    try {
      const s = await getDataSources();
      setDataSources(s);
    } catch (e) { console.log('Error loading sources:', e); }
  };

  const toggleItem = (list, setList, item) => {
    if (list.includes(item)) {
      setList(list.filter(x => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const filteredCountries = allCountries.filter(
    c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) && !countries.includes(c.name)
  ).slice(0, 8);

  const handleApply = () => {
    onApply({
      challenges, types, readinessMin, adoptionMin, regions,
      countries, userGroups, cost, complexity, sdgs, sources, grassrootsOnly,
    });
    onClose();
  };

  const handleReset = () => {
    setChallenges([]); setTypes([]); setReadinessMin(1); setAdoptionMin(1);
    setRegions([]); setCountries([]); setUserGroups([]); setCost([]);
    setComplexity([]); setSdgs([]); setSources([]); setGrassrootsOnly(false);
  };

  const rdyInfo = READINESS_LEVELS[readinessMin - 1];
  const adpInfo = ADOPTION_LEVELS[adoptionMin - 1];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filter innovations</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.doneBtn}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What's the challenge?</Text>
              <View style={styles.chipRow}>
                {CHALLENGES.map(c => {
                  const on = challenges.includes(c.id);
                  const color = c.iconColor || '#333';
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(challenges, setChallenges, c.id)}
                    >
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What kind of solution?</Text>
              <View style={styles.chipRow}>
                {TYPES.map(t => {
                  const on = types.includes(t.id);
                  const color = t.iconColor || '#333';
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(types, setTypes, t.id)}
                    >
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How ready is it?</Text>
              <View style={styles.sliderRow}>
                {READINESS_LEVELS.map(r => (
                  <TouchableOpacity
                    key={r.level}
                    style={[styles.sliderDot, readinessMin <= r.level && { backgroundColor: FILTER_CATEGORY_COLORS.readiness }]}
                    onPress={() => setReadinessMin(r.level)}
                  >
                    <Text style={[styles.sliderDotText, readinessMin <= r.level && { color: '#fff' }]}>
                      {r.level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Idea</Text>
                <Text style={styles.sliderLabel}>Working</Text>
                <Text style={styles.sliderLabel}>Ready</Text>
              </View>
              <View style={styles.sliderInfo}>
                <Text style={styles.sliderInfoTitle}>{rdyInfo.name} ({readinessMin})</Text>
                <Text style={styles.sliderInfoDesc}>{rdyInfo.description}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How widely adopted?</Text>
              <View style={styles.sliderRow}>
                {ADOPTION_LEVELS.map(a => (
                  <TouchableOpacity
                    key={a.level}
                    style={[styles.sliderDot, adoptionMin <= a.level && { backgroundColor: FILTER_CATEGORY_COLORS.adoption }]}
                    onPress={() => setAdoptionMin(a.level)}
                  >
                    <Text style={[styles.sliderDotText, adoptionMin <= a.level && { color: '#fff' }]}>
                      {a.level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Project</Text>
                <Text style={styles.sliderLabel}>Network</Text>
                <Text style={styles.sliderLabel}>Livelihood</Text>
              </View>
              <View style={styles.sliderInfo}>
                <Text style={styles.sliderInfoTitle}>{adpInfo.name} ({adoptionMin})</Text>
                <Text style={styles.sliderInfoDesc}>{adpInfo.description}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Where?</Text>
              <View style={styles.chipRow}>
                {REGIONS.map(r => {
                  const on = regions.includes(r.value);
                  const color = FILTER_CATEGORY_COLORS.region;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(regions, setRegions, r.value)}
                    >
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                      <Text style={styles.countryDDText}>{c.name}</Text>
                      <Text style={styles.countryDDCount}>{c.count}</Text>
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
                      <Text style={[styles.countryChipText, { color: FILTER_CATEGORY_COLORS.country }]}>{c} ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Who's it for?</Text>
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
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {u.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cost</Text>
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
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Complexity</Text>
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
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SDG impact</Text>
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
                    <Text style={styles.sdgChipText}>{s.number}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Data source</Text>
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
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>
                        {s.title} ({s.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grassroots</Text>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setGrassrootsOnly(!grassrootsOnly)}
              >
                <Text style={styles.toggleLabel}>Only grassroots innovations</Text>
                <View style={[styles.toggle, grassrootsOnly && { backgroundColor: FILTER_CATEGORY_COLORS.grassroots }]}>
                  <View style={[styles.toggleKnob, grassrootsOnly && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>Show results</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetBtnText}>Reset all</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  panel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_HEIGHT * 0.9 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  doneBtn: { fontSize: 14, fontWeight: '600', color: '#555' },
  content: { paddingHorizontal: 20, paddingTop: 16, maxHeight: SCREEN_HEIGHT * 0.65 },
  section: { marginBottom: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: '#030213', borderColor: '#030213' },
  chipText: { fontSize: 12, color: '#111' },
  chipTextOn: { color: '#fff' },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f3f3', alignItems: 'center', justifyContent: 'center' },
  sliderDotActive: { backgroundColor: '#22c55e' },
  sliderDotBlue: { backgroundColor: '#3b82f6' },
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
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 12 },
  toggle: { width: 44, height: 24, backgroundColor: '#e5e7eb', borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleOn: { backgroundColor: '#22c55e' },
  toggleKnob: { width: 20, height: 20, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleKnobOn: { alignSelf: 'flex-end' },
  footer: { flexDirection: 'row', padding: 12, paddingHorizontal: 20, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 10 },
  applyBtn: { flex: 2, backgroundColor: '#030213', borderRadius: 12, padding: 14, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resetBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, alignItems: 'center' },
  resetBtnText: { color: '#555', fontWeight: '500', fontSize: 13 },
});
