import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHALLENGES, TYPES, SDGS } from '../data/constants';
import {
  getStats, getTopRegions, getChallengeCounts, getTypeCounts,
  searchInnovations, getRecentInnovations, countInnovations,
  incrementThumbsUp, decrementThumbsUp,
} from '../database/db';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import FilterPanel from '../components/FilterPanel';
import { getActiveFilterTags, getFiltersAfterRemove } from '../utils/activeFilterTags';
import { AccessibilityContext } from '../context/AccessibilityContext';

export default function ExploreScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colorBlindMode } = React.useContext(AccessibilityContext);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [stats, setStats] = useState({ innovations: 0, countries: 0, sdgs: 17 });
  const [topRegions, setTopRegions] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});
  const [recentInnovations, setRecentInnovations] = useState([]);

  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownIcon, setDrilldownIcon] = useState(null);
  const [drilldownIconColor, setDrilldownIconColor] = useState('#333');
  const [drilldownResults, setDrilldownResults] = useState([]);
  const [drilldownCount, setDrilldownCount] = useState(0);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownLoadingMore, setDrilldownLoadingMore] = useState(false);
  const [drilldownHasMore, setDrilldownHasMore] = useState(false);

  const DRILLDOWN_PAGE_SIZE = 10;

  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});

  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [likedIds, setLikedIds] = useState(new Set());

  const LIKES_KEY = 'likedInnovations';

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LIKES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setLikedIds(new Set(arr));
      } catch (e) {
        console.log('Error loading likes:', e);
      }
    })();
  }, []);

  const handleThumbsUp = async (innovation) => {
    if (!innovation) return;
    const id = innovation.id;
    const hasLiked = likedIds.has(id);
    try {
      if (hasLiked) {
        await decrementThumbsUp(id);
      } else {
        await incrementThumbsUp(id);
      }
    } catch (e) {
      console.log('Thumbs up failed:', e);
    }

    const delta = hasLiked ? -1 : 1;
    const adjustList = (list) =>
      Array.isArray(list)
        ? list.map((item) =>
            item.id === id
              ? {
                  ...item,
                  thumbsUpCount: Math.max((item.thumbsUpCount ?? 0) + delta, 0),
                }
              : item
          )
        : list;

    setDrilldownResults((prev) => adjustList(prev));
    setRecentInnovations((prev) => adjustList(prev));
    setSelectedInnovation((prev) =>
      prev && prev.id === id
        ? {
            ...prev,
            thumbsUpCount: Math.max((prev.thumbsUpCount ?? 0) + delta, 0),
          }
        : prev
    );

    setLikedIds((prev) => {
      const next = new Set(prev);
      if (hasLiked) {
        next.delete(id);
      } else {
        next.add(id);
      }
      AsyncStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(next))).catch(
        (e) => {
          console.log('Error saving likes:', e);
        }
      );
      return next;
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const LOAD_TIMEOUT_MS = 6 * 60 * 1000; // 6 min total (download + queries)

      // Stage 1: Fast queries - show UI as soon as these complete
      const stage1Promise = Promise.all([
        getStats(),
        getRecentInnovations(5),
      ]);
      const stage1Timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Load timed out. Try again or use a development build.')), LOAD_TIMEOUT_MS);
      });
      const [s, ri] = await Promise.race([stage1Promise, stage1Timeout]);
      setStats(s);
      setRecentInnovations(ri);
      setLoading(false);

      // Stage 2: Slower queries - load in background, UI already visible
      const [tr, cc, tyc] = await Promise.all([
        getTopRegions(15),
        getChallengeCounts(),
        getTypeCounts(),
      ]);
      setTopRegions(tr);
      setChallengeCounts(cc);
      setTypeCounts(tyc);
    } catch (e) {
      console.log('Error loading data:', e);
      setLoadError(e?.message || String(e));
      setLoading(false);
    }
  };

  const openDrillByChallenge = async (challenge) => {
    setDrilldownTitle(challenge.name);
    setDrilldownIcon(challenge.icon);
    setDrilldownIconColor(challenge.iconColor || '#333');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ challenges: [challenge.id] });
    try {
      const filters = { challenges: [challenge.id] };
      const [results, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
      setDrilldownHasMore(results.length < count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillByType = async (type) => {
    setDrilldownTitle(type.name);
    setDrilldownIcon(type.icon);
    setDrilldownIconColor(type.iconColor || '#333');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ types: [type.id] });
    try {
      const filters = { types: [type.id] };
      const [results, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
      setDrilldownHasMore(results.length < count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillByRegion = async (region) => {
    setDrilldownTitle(region.name);
    setDrilldownIcon(region.icon || 'earth-outline');
    setDrilldownIconColor(region.iconColor || '#333');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ hubRegions: [region.id] });
    try {
      const filters = { hubRegions: [region.id] };
      const [results, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
      setDrilldownHasMore(results.length < count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillAll = async () => {
    setDrilldownTitle('All Innovations');
    setDrilldownIcon('apps-outline');
    setDrilldownIconColor('#333');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({});
    try {
      const [results, count] = await Promise.all([
        searchInnovations({}, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations({}),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
      setDrilldownHasMore(results.length < count);
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
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(results);
      setDrilldownCount(count);
      setDrilldownHasMore(results.length < count);
    } catch (e) {
      console.log('Error applying filters:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleLoadMoreDrilldown = useCallback(async () => {
    if (drilldownLoadingMore || !drilldownHasMore || drilldownLoading) return;
    setDrilldownLoadingMore(true);
    try {
      const nextResults = await searchInnovations(
        activeFilters,
        DRILLDOWN_PAGE_SIZE,
        drilldownResults.length
      );
      setDrilldownResults((prev) => [...prev, ...nextResults]);
      setDrilldownHasMore(drilldownResults.length + nextResults.length < drilldownCount);
    } catch (e) {
      console.log('Load more error:', e);
    } finally {
      setDrilldownLoadingMore(false);
    }
  }, [
    drilldownLoadingMore,
    drilldownHasMore,
    drilldownLoading,
    activeFilters,
    drilldownResults.length,
    drilldownCount,
  ]);

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
    return (
      <View style={styles.container}>
        <View style={[styles.drilldownHeader, { paddingTop: 12 + insets.top }]}>
          <TouchableOpacity style={styles.drilldownHeaderBack} onPress={() => setDrilldownVisible(false)} accessibilityLabel="Back to Explore" accessibilityRole="button">
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          {drilldownIcon ? (
            <View style={[styles.drilldownHeaderIconWrap, { backgroundColor: drilldownIconColor + '20' }]}>
              <Ionicons name={drilldownIcon} size={24} color={drilldownIconColor} />
            </View>
          ) : null}
          <Text style={styles.drilldownHeaderTitle} numberOfLines={1}>{drilldownTitle}</Text>
          <TouchableOpacity
            style={styles.drilldownHeaderSliders}
            onPress={() => setFilterVisible(true)}
            accessibilityLabel="Filters"
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        {(() => {
          const filterTags = getActiveFilterTags(activeFilters, { colorBlindMode });
          if (filterTags.length > 0) {
            return (
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
                      style={[styles.filterChip, { backgroundColor: tag.color + '22', borderColor: tag.color }]}
                      onPress={() => applyFilters(getFiltersAfterRemove(activeFilters, tag))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterChipText, { color: tag.color }]} numberOfLines={1}>{tag.label}</Text>
                      <Ionicons name="close-circle" size={16} color={tag.color} style={styles.filterChipClose} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          }
          return null;
        })()}
        {drilldownLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#22c55e" />
          </View>
        ) : (
          <FlatList
            data={drilldownResults}
            keyExtractor={item => String(item.id)}
            style={styles.drilldownList}
            contentContainerStyle={[styles.resultsList, { paddingTop: 12, paddingBottom: 100 + insets.bottom }]}
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
                isLiked={likedIds.has(item.id)}
                commentCount={item.commentCount ?? 0}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No innovations found matching your filters.</Text>
            }
            ListFooterComponent={
              drilldownHasMore && drilldownLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#22c55e" />
                  <Text style={styles.footerText}>Loading more innovations...</Text>
                </View>
              ) : null
            }
            onEndReached={handleLoadMoreDrilldown}
            onEndReachedThreshold={0.3}
          />
        )}

        <FilterPanel
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          onApply={(filters) => { applyFilters(filters); setFilterVisible(false); }}
          initialFilters={activeFilters}
        />
        <DetailDrawer
          innovation={selectedInnovation}
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
          onThumbsUp={handleThumbsUp}
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
            <TouchableOpacity key={c.id} style={styles.gridItem} onPress={() => openDrillByChallenge(c)} activeOpacity={0.7}>
              <Ionicons name={c.icon} size={24} color={c.iconColor || '#333'} />
              <View style={styles.gridItemText}>
                <Text style={styles.gridName} numberOfLines={2}>{c.name}</Text>
                <Text style={styles.gridSub}>{(challengeCounts[c.id] || 0).toLocaleString()} innovations</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionHeader}>WHAT KIND OF SOLUTION?</Text>
        <View style={styles.grid}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.id} style={styles.gridItem} onPress={() => openDrillByType(t)} activeOpacity={0.7}>
              <Ionicons name={t.icon} size={24} color={t.iconColor || '#333'} />
              <View style={styles.gridItemText}>
                <Text style={styles.gridName} numberOfLines={2}>{t.name}</Text>
                <Text style={styles.gridSub}>{(typeCounts[t.id] || 0).toLocaleString()} solutions</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionHeader}>INNOVATION HUBS</Text>
        <View style={styles.pillsWrap}>
          {topRegions.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.pill}
              onPress={() => openDrillByRegion(r)}
              activeOpacity={0.7}
            >
              <Text style={styles.pillText} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.pillCount}>{r.count}</Text>
            </TouchableOpacity>
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
            isLiked={likedIds.has(inn.id)}
            commentCount={inn.commentCount ?? 0}
          />
        ))}

        <TouchableOpacity style={styles.browseAllBtn} onPress={openDrillAll} activeOpacity={0.8}>
          <Text style={styles.browseAllText}>Browse All {stats.innovations.toLocaleString()} Innovations →</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
        onThumbsUp={handleThumbsUp}
        isLiked={selectedInnovation ? likedIds.has(selectedInnovation.id) : false}
        commentCount={selectedInnovation?.commentCount ?? 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1, paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#999', fontSize: 13 },
  footerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  footerText: { color: '#999', fontSize: 13 },
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
  gridItem: { width: '48%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  gridItemText: { flex: 1, minWidth: 0 },
  gridName: { fontSize: 13, fontWeight: '600' },
  gridSub: { fontSize: 11, color: '#999', marginTop: 2 },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontSize: 11, fontWeight: '500' },
  pillCount: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  browseAllBtn: { backgroundColor: '#030213', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', marginTop: 20, minHeight: 56 },
  browseAllText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  drilldownHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  drilldownHeaderBack: { padding: 8, marginLeft: -8 },
  drilldownHeaderSliders: { padding: 8, marginRight: -8 },
  drilldownHeaderIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drilldownHeaderTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111' },
  filterChipsWrap: { minHeight: 44, flexShrink: 0, backgroundColor: '#fff', paddingVertical: 8, marginBottom: 4 },
  filterChipsScroll: { flexGrow: 0 },
  filterChipsContent: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 2, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingLeft: 10, paddingVertical: 6, paddingRight: 6, marginRight: 6, maxWidth: 160, minHeight: 32 },
  filterChipText: { fontSize: 12, fontWeight: '600', flex: 1 },
  filterChipClose: { marginLeft: 4 },
  drilldownList: { flex: 1 },
  resultsList: { paddingHorizontal: 20, paddingTop: 20 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, padding: 48 },
});
