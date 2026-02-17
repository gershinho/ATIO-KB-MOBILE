import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGES, TYPES, SDGS } from '../data/constants';
import {
  getStats, getTopCountries, getChallengeCounts, getTypeCounts,
  searchInnovations, getRecentInnovations, countInnovations, incrementThumbsUp,
} from '../database/db';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import FilterPanel from '../components/FilterPanel';
import CommentsModal from '../components/CommentsModal';

export default function ExploreScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [stats, setStats] = useState({ innovations: 0, countries: 0, sdgs: 17 });
  const [topCountries, setTopCountries] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});
  const [recentInnovations, setRecentInnovations] = useState([]);

  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownResults, setDrilldownResults] = useState([]);
  const [drilldownCount, setDrilldownCount] = useState(0);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});

  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  const handleThumbsUp = async (innovation) => {
    if (!innovation) return;
    try {
      await incrementThumbsUp(innovation.id);
    } catch (e) {
      console.log('Thumbs up failed:', e);
    }
    const bump = (list) =>
      Array.isArray(list)
        ? list.map((item) =>
            item.id === innovation.id
              ? { ...item, thumbsUpCount: (item.thumbsUpCount ?? 0) + 1 }
              : item
          )
        : list;
    setDrilldownResults((prev) => bump(prev));
    setRecentInnovations((prev) => bump(prev));
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const LOAD_TIMEOUT_MS = 6 * 60 * 1000; // 6 min total (download + queries)
      const dataPromise = Promise.all([
        getStats(),
        getTopCountries(15),
        getChallengeCounts(),
        getTypeCounts(),
        getRecentInnovations(5),
      ]);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Load timed out. Try again or use a development build.')), LOAD_TIMEOUT_MS);
      });
      const [s, tc, cc, tyc, ri] = await Promise.race([dataPromise, timeoutPromise]);
      setStats(s);
      setTopCountries(tc);
      setChallengeCounts(cc);
      setTypeCounts(tyc);
      setRecentInnovations(ri);
    } catch (e) {
      console.log('Error loading data:', e);
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const openDrillByChallenge = async (challenge) => {
    setDrilldownTitle(`${challenge.icon} ${challenge.name}`);
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ challenges: [challenge.id] });
    try {
      const filters = { challenges: [challenge.id] };
      const [results, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillByType = async (type) => {
    setDrilldownTitle(`${type.icon} ${type.name}`);
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ types: [type.id] });
    try {
      const filters = { types: [type.id] };
      const [results, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillAll = async () => {
    setDrilldownTitle('All Innovations');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({});
    try {
      const [results, count] = await Promise.all([
        searchInnovations({}, 30),
        countInnovations({}),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const applyFilters = async (filters) => {
    setActiveFilters(filters);
    setDrilldownLoading(true);
    try {
      const [results, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error applying filters:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrawer = (innovation) => {
    setSelectedInnovation(innovation);
    setDrawerVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>Loading ATIO database...</Text>
        <Text style={styles.loadingHint}>First launch may take 1–2 min to download.</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorTitle}>Could not load database</Text>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (drilldownVisible) {
    const tags = [];
    if (activeFilters.challenges) activeFilters.challenges.forEach(id => {
      const c = CHALLENGES.find(x => x.id === id);
      if (c) tags.push(c.name);
    });
    if (activeFilters.types) activeFilters.types.forEach(id => {
      const t = TYPES.find(x => x.id === id);
      if (t) tags.push(t.name);
    });
    if (activeFilters.readinessMin > 1) tags.push(`Readiness ${activeFilters.readinessMin}+`);
    if (activeFilters.adoptionMin > 1) tags.push(`Adoption ${activeFilters.adoptionMin}+`);
    if (activeFilters.countries) activeFilters.countries.forEach(c => tags.push(c));
    if (activeFilters.sdgs) activeFilters.sdgs.forEach(s => tags.push(`SDG ${s}`));
    if (activeFilters.grassrootsOnly) tags.push('Grassroots');

    return (
      <View style={styles.container}>
        <View style={styles.drillHeader}>
          <TouchableOpacity onPress={() => setDrilldownVisible(false)} style={styles.drillBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.drillTitle}>{drilldownTitle}</Text>
            <Text style={styles.drillCount}>{drilldownCount.toLocaleString()} innovations</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
          <TouchableOpacity style={[styles.filterBtn, styles.filterBtnOn]} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnTextOn}>Type</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText}>Readiness</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText}>Adoption</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText}>Where</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText}>Cost</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText}>SDG</Text>
          </TouchableOpacity>
        </ScrollView>

        {tags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {tags.map((t, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {drilldownLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#22c55e" />
          </View>
        ) : (
          <FlatList
            data={drilldownResults}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.resultsList}
            renderItem={({ item }) => (
              <InnovationCard
                innovation={item}
                title={item.title}
                countries={item.countries?.join(', ') || item.region}
                description={item.shortDescription}
                readinessLevel={item.readinessLevel}
                isGrassroots={item.isGrassroots}
                cost={item.cost}
                complexity={item.complexity}
                onLearnMore={() => openDrawer(item)}
                thumbsUpCount={item.thumbsUpCount ?? 0}
                onThumbsUp={handleThumbsUp}
                onComments={setCommentsInnovation}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No innovations found matching your filters.</Text>
            }
          />
        )}

        <FilterPanel
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          onApply={applyFilters}
          initialFilters={activeFilters}
        />

        <DetailDrawer
          innovation={selectedInnovation}
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
        />
        <CommentsModal
          visible={!!commentsInnovation}
          innovation={commentsInnovation}
          onClose={() => setCommentsInnovation(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.innovations.toLocaleString()}</Text>
            <Text style={styles.statLabel}>INNOVATIONS</Text>
          </View>
          <View style={[styles.statItem, styles.statBorder]}>
            <Text style={styles.statNum}>{stats.countries}+</Text>
            <Text style={styles.statLabel}>COUNTRIES</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.sdgs}</Text>
            <Text style={styles.statLabel}>SDGS</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>WHAT'S THE CHALLENGE?</Text>
        <View style={styles.grid}>
          {CHALLENGES.map((c) => (
            <TouchableOpacity key={c.id} style={styles.gridItem} onPress={() => openDrillByChallenge(c)}>
              <Ionicons name={c.icon} size={22} color="#333" />
              <View style={{ flex: 1 }}>
                <Text style={styles.gridName}>{c.name}</Text>
                <Text style={styles.gridSub}>{(challengeCounts[c.id] || 0).toLocaleString()} innovations</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionHeader}>WHAT KIND OF SOLUTION?</Text>
        <View style={styles.grid}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.id} style={styles.gridItem} onPress={() => openDrillByType(t)}>
              <Ionicons name={t.icon} size={22} color="#333" />
              <View style={{ flex: 1 }}>
                <Text style={styles.gridName}>{t.name}</Text>
                <Text style={styles.gridSub}>{(typeCounts[t.id] || 0).toLocaleString()} solutions</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionHeader}>INNOVATION HUBS</Text>
        <View style={styles.pillsWrap}>
          {topCountries.map(c => (
            <View key={c.name} style={styles.pill}>
              <Text style={styles.pillText}>{c.name}</Text>
              <Text style={styles.pillCount}>{c.count}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeader}>RECENT INNOVATIONS</Text>
        {recentInnovations.map(inn => (
          <InnovationCard
            key={inn.id}
            innovation={inn}
            title={inn.title}
            countries={inn.countries?.join(', ') || inn.region}
            description={inn.shortDescription}
            readinessLevel={inn.readinessLevel}
            isGrassroots={inn.isGrassroots}
            cost={inn.cost}
            complexity={inn.complexity}
            onLearnMore={() => openDrawer(inn)}
            thumbsUpCount={inn.thumbsUpCount ?? 0}
            onThumbsUp={handleThumbsUp}
            onComments={setCommentsInnovation}
          />
        ))}

        <TouchableOpacity style={styles.browseAllBtn} onPress={openDrillAll}>
          <Text style={styles.browseAllText}>Browse All {stats.innovations.toLocaleString()} Innovations →</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />
      <CommentsModal
        visible={!!commentsInnovation}
        innovation={commentsInnovation}
        onClose={() => setCommentsInnovation(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1, paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#999', fontSize: 13 },
  loadingHint: { marginTop: 8, color: '#bbb', fontSize: 11 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#030213', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden', marginTop: 16 },
  statItem: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e5e7eb' },
  statNum: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, color: '#999', fontWeight: '600', letterSpacing: 0.3, marginTop: 4 },
  sectionHeader: { fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '48%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gridName: { fontSize: 12, fontWeight: '600' },
  gridSub: { fontSize: 10, color: '#999', marginTop: 2 },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontSize: 11, fontWeight: '500' },
  pillCount: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  browseAllBtn: { backgroundColor: '#030213', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  browseAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  drillHeader: { backgroundColor: '#030213', padding: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  drillBack: { padding: 4 },
  drillTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  drillCount: { fontSize: 11, color: '#ccc', marginTop: 2 },
  filterBar: { backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterBarContent: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', flexDirection: 'row' },
  filterBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginRight: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  filterBtnOn: { backgroundColor: '#030213', borderColor: '#030213' },
  filterBtnText: { fontSize: 16, fontWeight: '600', color: '#111', lineHeight: 22 },
  filterBtnTextOn: { fontSize: 16, fontWeight: '600', color: '#fff', lineHeight: 22 },
  tagsRow: { paddingHorizontal: 20, paddingVertical: 8, maxHeight: 50 },
  tag: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  tagText: { fontSize: 13, color: '#555' },
  resultsList: { padding: 20, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13, padding: 40 },
});
