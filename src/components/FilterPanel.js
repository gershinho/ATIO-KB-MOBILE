import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Modal, TextInput, Dimensions, LayoutAnimation, Platform, UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {
  CHALLENGES, TYPES, USER_GROUPS, READINESS_LEVELS, ADOPTION_LEVELS,
  SDGS, COST_LEVELS, COMPLEXITY_LEVELS,
} from '../data/constants';
import { AccessibilityContext } from '../context/AccessibilityContext';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import { FILTER_CATEGORY_COLORS } from '../utils/activeFilterTags';
import { getAllCountries, getDataSources } from '../database/db';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function buildSelectedSubTermsFromKeywords(challengeKeywords) {
  if (!challengeKeywords || !challengeKeywords.length) return {};
  const out = {};
  for (const c of CHALLENGES) {
    for (const st of c.subTerms || []) {
      if (challengeKeywords.includes(st.keyword)) {
        out[c.id] = out[c.id] || [];
        out[c.id].push(st.keyword);
      }
    }
  }
  return out;
}

function buildCategoriesInScopeFromKeywords(challengeKeywords) {
  if (!challengeKeywords || !challengeKeywords.length) return [];
  const seen = new Set();
  for (const c of CHALLENGES) {
    const kws = (c.subTerms || []).map(s => s.keyword);
    const matching = challengeKeywords.filter(k => kws.includes(k));
    if (matching.length > 0) seen.add(c.id);
  }
  return Array.from(seen);
}

function buildSelectedTypeSubTermsFromKeywords(typeKeywords) {
  if (!typeKeywords || !typeKeywords.length) return {};
  const out = {};
  for (const t of TYPES) {
    for (const st of t.subTerms || []) {
      if (typeKeywords.includes(st.keyword)) {
        out[t.id] = out[t.id] || [];
        out[t.id].push(st.keyword);
      }
    }
  }
  return out;
}

function buildTypesInScopeFromKeywords(typeKeywords) {
  if (!typeKeywords || !typeKeywords.length) return [];
  const seen = new Set();
  for (const t of TYPES) {
    const kws = (t.subTerms || []).map(s => s.keyword);
    const matching = typeKeywords.filter(k => kws.includes(k));
    if (matching.length > 0) seen.add(t.id);
  }
  return Array.from(seen);
}

export default function FilterPanel({ visible, onClose, onApply, initialFilters, entryFilters }) {
  const { reduceMotion } = useContext(AccessibilityContext);
  const [expandedChallenge, setExpandedChallenge] = useState(null);
  const [selectedSubTerms, setSelectedSubTerms] = useState(() =>
    buildSelectedSubTermsFromKeywords(initialFilters?.challengeKeywords)
  );
  const [categoriesInScope, setCategoriesInScope] = useState(() =>
    buildCategoriesInScopeFromKeywords(initialFilters?.challengeKeywords)
  );
  const [expandedType, setExpandedType] = useState(null);
  const [selectedTypeSubTerms, setSelectedTypeSubTerms] = useState(() =>
    buildSelectedTypeSubTermsFromKeywords(initialFilters?.typeKeywords)
  );
  const [typesInScope, setTypesInScope] = useState(() =>
    buildTypesInScopeFromKeywords(initialFilters?.typeKeywords)
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
      setSelectedSubTerms(buildSelectedSubTermsFromKeywords(initialFilters.challengeKeywords));
      setCategoriesInScope(buildCategoriesInScopeFromKeywords(initialFilters.challengeKeywords));
      setExpandedChallenge(null);
      setSelectedTypeSubTerms(buildSelectedTypeSubTermsFromKeywords(initialFilters.typeKeywords));
      setTypesInScope(buildTypesInScopeFromKeywords(initialFilters.typeKeywords));
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
    setCategoriesInScope(prev => (prev.includes(id) ? prev : [...prev, id]));
    setExpandedChallenge(id);
  };

  const collapseChallenge = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedChallenge(null);
  };

  const clearChallengeAndCollapse = (id) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCategoriesInScope(prev => prev.filter(x => x !== id));
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

  const getChallengeKeywordsForApply = () => {
    const out = [];
    for (const cid of categoriesInScope) {
      const c = CHALLENGES.find(x => x.id === cid);
      if (!c) continue;
      const selected = selectedSubTerms[cid];
      if (selected && selected.length > 0) {
        out.push(...selected);
      } else {
        out.push(...(c.subTerms || []).map(s => s.keyword));
      }
    }
    return out;
  };

  const getTypeKeywordsForApply = () => {
    const out = [];
    for (const tid of typesInScope) {
      const t = TYPES.find(x => x.id === tid);
      if (!t) continue;
      const selected = selectedTypeSubTerms[tid];
      if (selected && selected.length > 0) {
        out.push(...selected);
      } else {
        out.push(...(t.subTerms || []).map(s => s.keyword));
      }
    }
    return out;
  };

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
    setSelectedSubTerms(buildSelectedSubTermsFromKeywords(entry.challengeKeywords));
    setCategoriesInScope(buildCategoriesInScopeFromKeywords(entry.challengeKeywords));
    setExpandedChallenge(null);
    setSelectedTypeSubTerms(buildSelectedTypeSubTermsFromKeywords(entry.typeKeywords));
    setTypesInScope(buildTypesInScopeFromKeywords(entry.typeKeywords));
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
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filter innovations</Text>
            <TouchableOpacity onPress={handleApply}>
              <Text style={styles.doneBtn}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What's the challenge?</Text>
              {expandedChallenge === null ? (
                <View style={styles.chipRow}>
                  {CHALLENGES.map(c => {
                    const inScope = categoriesInScope.includes(c.id);
                    const selected = selectedSubTerms[c.id];
                    const count = selected && selected.length > 0
                      ? selected.length
                      : (inScope ? (c.subTerms || []).length : 0);
                    const color = c.iconColor || '#333';
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, styles.chipWithBadge]}
                        onPress={() => expandChallenge(c.id)}
                      >
                        <Text style={styles.chipText}>{c.name}</Text>
                        {count > 0 && (
                          <View style={[styles.chipBadge, { backgroundColor: color }]}>
                            <Text style={styles.chipBadgeText}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.drillDownArea}
                  onPress={collapseChallenge}
                  activeOpacity={1}
                >
                  <Text style={styles.backLink}>← Back to all</Text>
                  {(() => {
                    const c = CHALLENGES.find(x => x.id === expandedChallenge);
                    if (!c) return null;
                    const color = c.iconColor || '#333';
                    return (
                      <>
                        <TouchableOpacity
                          style={[styles.expandedChip, { backgroundColor: color }]}
                          onPress={() => clearChallengeAndCollapse(c.id)}
                        >
                          <Text style={styles.expandedChipText}>{c.name}</Text>
                        </TouchableOpacity>
                        <View style={styles.subTermRow}>
                          {(c.subTerms || []).map(st => {
                            const sel = (selectedSubTerms[c.id] || []).includes(st.keyword);
                            return (
                              <TouchableOpacity
                                key={st.keyword}
                                style={[
                                  styles.subTermChip,
                                  sel && { backgroundColor: color, borderColor: color },
                                ]}
                                onPress={() => toggleSubTerm(c.id, st.keyword)}
                              >
                                <Text style={[styles.subTermChipText, sel && { color: '#fff' }]}>
                                  {st.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    );
                  })()}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What kind of solution?</Text>
              {expandedType === null ? (
                <View style={styles.chipRow}>
                  {TYPES.map(t => {
                    const inScope = typesInScope.includes(t.id);
                    const selected = selectedTypeSubTerms[t.id];
                    const count = selected && selected.length > 0
                      ? selected.length
                      : (inScope ? (t.subTerms || []).length : 0);
                    const color = t.iconColor || '#333';
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.chip, styles.chipWithBadge]}
                        onPress={() => expandType(t.id)}
                      >
                        <Text style={styles.chipText}>{t.name}</Text>
                        {count > 0 && (
                          <View style={[styles.chipBadge, { backgroundColor: color }]}>
                            <Text style={styles.chipBadgeText}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.drillDownArea}
                  onPress={collapseType}
                  activeOpacity={1}
                >
                  <Text style={styles.backLink}>← Back to all</Text>
                  {(() => {
                    const t = TYPES.find(x => x.id === expandedType);
                    if (!t) return null;
                    const color = t.iconColor || '#333';
                    return (
                      <>
                        <TouchableOpacity
                          style={[styles.expandedChip, { backgroundColor: color }]}
                          onPress={() => clearTypeAndCollapse(t.id)}
                        >
                          <Text style={styles.expandedChipText}>{t.name}</Text>
                        </TouchableOpacity>
                        <View style={styles.subTermRow}>
                          {(t.subTerms || []).map(st => {
                            const sel = (selectedTypeSubTerms[t.id] || []).includes(st.keyword);
                            return (
                              <TouchableOpacity
                                key={st.keyword}
                                style={[
                                  styles.subTermChip,
                                  sel && { backgroundColor: color, borderColor: color },
                                ]}
                                onPress={() => toggleTypeSubTerm(t.id, st.keyword)}
                              >
                                <Text style={[styles.subTermChipText, sel && { color: '#fff' }]}>
                                  {st.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    );
                  })()}
                </TouchableOpacity>
              )}
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
                {INNOVATION_HUB_REGIONS.map(r => {
                  const on = hubRegions.includes(r.id);
                  const color = r.iconColor || FILTER_CATEGORY_COLORS.region;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.chip, on && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleItem(hubRegions, setHubRegions, r.id)}
                    >
                      <Text style={[styles.chipText, on && { color: '#fff' }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.sectionTitle, { marginTop: 12, fontSize: 12 }]}>Search specific country</Text>
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
  chipWithBadge: { position: 'relative' },
  chipBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  drillDownArea: { minHeight: 80 },
  backLink: { fontSize: 12, color: '#999', marginBottom: 8 },
  expandedChip: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 16, alignSelf: 'center', marginBottom: 12 },
  expandedChipText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  subTermRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subTermChip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  subTermChipText: { fontSize: 11, color: '#111' },
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
