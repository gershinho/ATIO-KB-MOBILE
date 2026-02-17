import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Keyboard,
  LayoutAnimation, UIManager,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fullTextSearch } from '../database/db';
import { CHALLENGES, TYPES } from '../data/constants';
import {
  getStats, getTopCountries, getChallengeCounts, getTypeCounts,
  searchInnovations, getRecentInnovations, countInnovations, incrementThumbsUp,
} from '../database/db';
import { downloadInnovationToFile } from '../utils/downloadInnovation';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import { DownloadCompleteContext } from '../context/DownloadCompleteContext';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import FilterPanel from '../components/FilterPanel';
import CommentsModal from '../components/CommentsModal';

const BOOKMARKS_KEY = 'bookmarkedInnovations';
const DOWNLOADS_KEY = 'completedDownloads';

export default function HomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { refreshBookmarkCount } = React.useContext(BookmarkCountContext);
  const { triggerDownloadComplete } = React.useContext(DownloadCompleteContext);
  const containerStyle = [styles.container, { paddingTop: insets.top }];
  const [mode, setMode] = useState('search'); // 'search' | 'explore'

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchBarExpanded, setSearchBarExpanded] = useState(false);

  // Explore state
  const [exploreLoading, setExploreLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [stats, setStats] = useState({ innovations: 0, countries: 0, sdgs: 17 });
  const [topCountries, setTopCountries] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});
  const [recentInnovations, setRecentInnovations] = useState([]);
  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownIcon, setDrilldownIcon] = useState(null);
  const [drilldownResults, setDrilldownResults] = useState([]);
  const [drilldownCount, setDrilldownCount] = useState(0);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});

  // Shared
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [bookmarksList, setBookmarksList] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadToast, setDownloadToast] = useState(null); // { id, title, progress, innovation }
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  const loadBookmarks = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setBookmarksList(arr);
      setBookmarkedIds(new Set(arr.map((i) => i.id)));
    } catch (e) {
      console.log('Error loading bookmarks:', e);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Reset to pre-search state when user taps Home tab while already on Home
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (isFocused) {
        setHasSearched(false);
        setQuery('');
        setResults([]);
        setMode('search');
        setDrilldownVisible(false);
        setDrawerVisible(false);
        setSelectedInnovation(null);
      }
    });
    return unsubscribe;
  }, [navigation, isFocused]);

  const handleThumbsUp = useCallback(async (innovation) => {
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
    setResults((prev) => bump(prev));
    setRecentInnovations((prev) => bump(prev));
    setDrilldownResults((prev) => bump(prev));
  }, []);

  const toggleBookmark = useCallback(async (innovation) => {
    if (!innovation) return;
    const id = innovation.id;
    const nextIds = new Set(bookmarkedIds);
    let nextList = [...bookmarksList];
    if (nextIds.has(id)) {
      nextIds.delete(id);
      nextList = nextList.filter((i) => i.id !== id);
    } else {
      nextIds.add(id);
      nextList = [{ ...innovation, bookmarkedAt: Date.now() }, ...nextList];
    }
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextList));
    setBookmarkedIds(nextIds);
    setBookmarksList(nextList);
    refreshBookmarkCount();
  }, [bookmarkedIds, bookmarksList, refreshBookmarkCount]);

  const addDownload = useCallback((innovation) => {
    if (!innovation) return;
    if (downloadToast) return; // one at a time
    setDownloadToast({ id: innovation.id, title: innovation.title, progress: 0, innovation });
  }, [downloadToast]);

  useEffect(() => {
    if (!downloadToast) return;
    const interval = setInterval(() => {
      setDownloadToast((prev) => {
        if (!prev || prev.progress >= 100) return prev;
        const next = prev.progress + 4;
        return { ...prev, progress: next >= 100 ? 100 : next };
      });
    }, 80);
    return () => clearInterval(interval);
  }, [downloadToast?.id]);

  useEffect(() => {
    if (!downloadToast || downloadToast.progress < 100) return;
    const { innovation } = downloadToast;
    let cancelled = false;
    (async () => {
      try {
        const result = await downloadInnovationToFile(innovation);
        if (cancelled) return;
        if (!result.success) {
          Alert.alert('Download failed', result.error || 'Could not save file. You can try again.');
          setDownloadToast(null);
          return;
        }
        const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (!arr.some((i) => i.id === innovation.id)) {
          const next = [{ ...innovation, downloadedAt: Date.now() }, ...arr];
          await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
        }
        if (!cancelled) triggerDownloadComplete();
      } catch (e) {
        if (!cancelled) Alert.alert('Download failed', e?.message || 'Could not save file.');
      } finally {
        if (!cancelled) setDownloadToast(null);
      }
    })();
    return () => { cancelled = true; };
  }, [downloadToast?.progress, downloadToast?.id]);

  const handleSearch = async () => {
    Keyboard.dismiss();
    setIsRecording(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchBarExpanded(false);
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const cleanQuery = query.trim().split(/\s+/).join(' OR ');
      const res = await fullTextSearch(cleanQuery, 30);
      setResults(res);
    } catch (e) {
      console.log('Search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const loadExploreData = useCallback(async () => {
    setExploreLoading(true);
    setLoadError(null);
    try {
      const [s, tc, cc, tyc, ri] = await Promise.all([
        getStats(),
        getTopCountries(15),
        getChallengeCounts(),
        getTypeCounts(),
        getRecentInnovations(5),
      ]);
      setStats(s);
      setTopCountries(tc);
      setChallengeCounts(cc);
      setTypeCounts(tyc);
      setRecentInnovations(ri);
    } catch (e) {
      setLoadError(e?.message || String(e));
    } finally {
      setExploreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'explore') loadExploreData();
  }, [mode, loadExploreData]);

  const openDrillByChallenge = async (challenge) => {
    setDrilldownTitle(challenge.name);
    setDrilldownIcon(challenge.icon);
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ challenges: [challenge.id] });
    try {
      const filters = { challenges: [challenge.id] };
      const [res, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillByType = async (type) => {
    setDrilldownTitle(type.name);
    setDrilldownIcon(type.icon);
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ types: [type.id] });
    try {
      const filters = { types: [type.id] };
      const [res, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openDrillAll = async () => {
    setDrilldownTitle('All Innovations');
    setDrilldownIcon('apps-outline');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({});
    try {
      const [res, count] = await Promise.all([
        searchInnovations({}, 30),
        countInnovations({}),
      ]);
      setDrilldownResults(res);
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
      const [res, count] = await Promise.all([
        searchInnovations(filters, 30),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
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

  const renderCard = (item) => (
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
      isBookmarked={bookmarkedIds.has(item.id)}
      onBookmark={toggleBookmark}
      onDownload={addDownload}
      showTopIcons
      thumbsUpCount={item.thumbsUpCount ?? 0}
      onThumbsUp={handleThumbsUp}
      onComments={setCommentsInnovation}
    />
  );

  const starterPrompts = [
    'How can I reduce post-harvest losses?',
    'Drought-tolerant crops for small farms',
    'Low-cost irrigation solutions',
    'Digital tools for extension services',
  ];

  // —— Search content ——
  const searchContent = () => {
    if (!hasSearched) {
      return (
        <View style={styles.heroSection}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="leaf-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.logoText}>ATIOKB</Text>
          </View>
          <Text style={styles.heroTitle}>Describe the problem you are facing</Text>
          <Text style={styles.heroSubtitle}>Powered by AI</Text>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter your problem description here..."
              placeholderTextColor="#999"
              multiline
              value={query}
              onChangeText={setQuery}
            />
            <TouchableOpacity
              style={[styles.micBtn, isRecording && styles.micBtnActive]}
              onPress={() => {
                setIsRecording((prev) => !prev);
                // Voice search placeholder – could integrate speech-to-text later
                if (!isRecording) {
                  Alert.alert('Voice search', 'Voice input will be available in a future update.');
                }
              }}
            >
              <Ionicons name="mic-outline" size={20} color={isRecording ? '#fff' : '#666'} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Search Solutions</Text>
          </TouchableOpacity>
          <Text style={styles.promptsTitle}>Try asking about:</Text>
          {starterPrompts.map((p, i) => (
            <TouchableOpacity key={i} style={styles.promptChip} onPress={() => setQuery(p)}>
              <Text style={styles.promptText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    const expandSearch = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSearchBarExpanded(true);
    };
    const collapseSearch = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSearchBarExpanded(false);
    };

    return (
      <>
        <View style={[styles.searchBarRow, searchBarExpanded && styles.searchBarRowExpanded]}>
          {searchBarExpanded ? (
            <View style={styles.searchExpandedCard}>
              <Text style={styles.searchExpandedLabel}>Refine your search</Text>
              <TextInput
                style={styles.searchExpandedInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Describe the problem you're trying to solve..."
                placeholderTextColor="#999"
                multiline
                onBlur={collapseSearch}
                onSubmitEditing={handleSearch}
              />
              <View style={styles.searchExpandedActions}>
                <TouchableOpacity
                  style={[styles.searchExpandedMicBtn, isRecording && styles.micBtnActive]}
                  onPress={() => {
                    setIsRecording((prev) => !prev);
                    if (!isRecording) {
                      Alert.alert('Voice search', 'Voice input will be available in a future update.');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mic-outline" size={22} color={isRecording ? '#fff' : '#374151'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.searchExpandedPrimaryBtn}
                  onPress={handleSearch}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.searchExpandedPrimaryLabel}>Search Solutions</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.searchBarInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search..."
                placeholderTextColor="#999"
                onFocus={expandSearch}
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity style={styles.searchBarBtn} onPress={handleSearch}>
                <Ionicons name="search-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : (
          <TouchableWithoutFeedback
            onPress={() => {
              Keyboard.dismiss();
              if (searchBarExpanded) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSearchBarExpanded(false);
              }
            }}
          >
            <View style={styles.resultsContainer}>
              <Text style={styles.poweredByResults}>Powered by AI</Text>
              <FlatList
                data={results}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.resultsListSearch}
                renderItem={({ item }) => renderCard(item)}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No innovations found. Try a different search term.</Text>
                }
              />
            </View>
          </TouchableWithoutFeedback>
        )}
      </>
    );
  };

  // —— Explore content: loading / error ——
  if (mode === 'explore' && exploreLoading && !drilldownVisible) {
    return (
      <View style={containerStyle}>
        <View style={styles.pillWrap}>
          <TouchableOpacity style={[styles.pill, mode === 'search' && styles.pillActive]} onPress={() => setMode('search')}>
            <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pill, mode === 'explore' && styles.pillActive]} onPress={() => setMode('explore')}>
            <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading ATIO database...</Text>
        </View>
      </View>
    );
  }

  if (mode === 'explore' && loadError && !drilldownVisible) {
    return (
      <View style={containerStyle}>
        <View style={styles.pillWrap}>
          <TouchableOpacity style={[styles.pill, mode === 'search' && styles.pillActive]} onPress={() => setMode('search')}>
            <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pill, mode === 'explore' && styles.pillActive]} onPress={() => setMode('explore')}>
            <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorTitle}>Could not load database</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadExploreData}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // —— Explore: drilldown view ——
  if (mode === 'explore' && drilldownVisible) {
    const tags = [];
    if (activeFilters.challenges) activeFilters.challenges.forEach((id) => {
      const c = CHALLENGES.find((x) => x.id === id);
      if (c) tags.push(c.name);
    });
    if (activeFilters.types) activeFilters.types.forEach((id) => {
      const t = TYPES.find((x) => x.id === id);
      if (t) tags.push(t.name);
    });

    return (
      <View style={containerStyle}>
        <View style={styles.pillWrap}>
          <TouchableOpacity style={[styles.pill, mode === 'search' && styles.pillActive]} onPress={() => setMode('search')}>
            <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pill, mode === 'explore' && styles.pillActive]} onPress={() => setMode('explore')}>
            <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.drillHeader}>
          <TouchableOpacity onPress={() => setDrilldownVisible(false)} style={styles.drillBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.drillHeaderContent}>
            {drilldownIcon ? <Ionicons name={drilldownIcon} size={22} color="#fff" style={styles.drillTitleIcon} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.drillTitle}>{drilldownTitle}</Text>
              <Text style={styles.drillCount}>{drilldownCount.toLocaleString()} innovations</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
          <TouchableOpacity style={[styles.filterBtn, styles.filterBtnOn]} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnTextOn} allowFontScaling>Type</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText} allowFontScaling>Readiness</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText} allowFontScaling>Adoption</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText} allowFontScaling>Where</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)} activeOpacity={0.7}>
            <Text style={styles.filterBtnText} allowFontScaling>SDG</Text>
          </TouchableOpacity>
        </ScrollView>
        {tags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
            {tags.map((t, i) => (
              <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
            ))}
          </ScrollView>
        )}
        {drilldownLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : (
          <FlatList
            data={drilldownResults}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.resultsList}
            renderItem={({ item }) => renderCard(item)}
            ListEmptyComponent={<Text style={styles.emptyText}>No innovations found.</Text>}
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
          startExpanded
          isBookmarked={selectedInnovation ? bookmarkedIds.has(selectedInnovation.id) : false}
          onBookmark={selectedInnovation ? () => toggleBookmark(selectedInnovation) : undefined}
          onDownload={selectedInnovation ? () => addDownload(selectedInnovation) : undefined}
        />
        {downloadToast && (
          <View style={styles.downloadToast}>
            <Text style={styles.downloadToastText}>"{downloadToast.title}" is downloading...</Text>
            <Text style={styles.downloadToastPct}>{Math.round(downloadToast.progress)}%</Text>
            <View style={styles.downloadToastBar}>
              <View style={[styles.downloadToastFill, { width: `${downloadToast.progress}%` }]} />
            </View>
          </View>
        )}
        <CommentsModal
          visible={!!commentsInnovation}
          innovation={commentsInnovation}
          onClose={() => setCommentsInnovation(null)}
        />
      </View>
    );
  }

  // —— Explore: main scroll ——
  const exploreContent = () => (
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
        {topCountries.map((c) => (
          <View key={c.name} style={styles.pillCountry}>
            <Text style={styles.pillTextCountry}>{c.name}</Text>
            <Text style={styles.pillCount}>{c.count}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.sectionHeader}>RECENT INNOVATIONS</Text>
      {recentInnovations.map((inn) => (
        <View key={inn.id}>{renderCard(inn)}</View>
      ))}
      <TouchableOpacity style={styles.browseAllBtn} onPress={openDrillAll}>
        <Text style={styles.browseAllText}>Browse All {stats.innovations.toLocaleString()} Innovations →</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  return (
    <View style={containerStyle}>
      <View style={styles.pillWrap}>
        <TouchableOpacity style={[styles.pill, mode === 'search' && styles.pillActive]} onPress={() => setMode('search')}>
          <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pill, mode === 'explore' && styles.pillActive]} onPress={() => setMode('explore')}>
          <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
        </TouchableOpacity>
      </View>
      {mode === 'search' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {searchContent()}
        </KeyboardAvoidingView>
      ) : (
        exploreContent()
      )}
      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        startExpanded
        isBookmarked={selectedInnovation ? bookmarkedIds.has(selectedInnovation.id) : false}
        onBookmark={selectedInnovation ? () => toggleBookmark(selectedInnovation) : undefined}
        onDownload={selectedInnovation ? () => addDownload(selectedInnovation) : undefined}
      />
      {downloadToast && (
        <View style={styles.downloadToast}>
          <Text style={styles.downloadToastText}>"{downloadToast.title}" is downloading...</Text>
          <Text style={styles.downloadToastPct}>{Math.round(downloadToast.progress)}%</Text>
          <View style={styles.downloadToastBar}>
            <View style={[styles.downloadToastFill, { width: `${downloadToast.progress}%` }]} />
          </View>
        </View>
      )}
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
  pillWrap: { flexDirection: 'row', backgroundColor: '#f3f3f3', marginHorizontal: 20, marginTop: 12, marginBottom: 8, borderRadius: 999, padding: 4 },
  pill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  pillActive: { backgroundColor: '#000' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#666' },
  pillTextActive: { color: '#fff' },
  heroSection: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  logoIcon: { width: 32, height: 32, backgroundColor: '#22c55e', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  heroTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 20 },
  searchInputWrap: { position: 'relative', marginBottom: 0 },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, paddingBottom: 44, fontSize: 13, minHeight: 120, textAlignVertical: 'top' },
  micBtn: { position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: '#dc2626' },
  poweredByResults: { textAlign: 'center', color: '#999', fontSize: 10, marginTop: -8, marginBottom: 12 },
  searchBtn: { backgroundColor: '#000', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  promptsTitle: { fontSize: 12, color: '#999', marginTop: 24, marginBottom: 10 },
  promptChip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 8 },
  promptText: { fontSize: 12, color: '#555' },
  searchBarRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  searchBarRowExpanded: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  searchBarInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  searchExpandedCard: { gap: 0 },
  searchExpandedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  searchExpandedInput: {
    minHeight: 120,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  searchExpandedActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  searchExpandedMicBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchExpandedPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  searchExpandedPrimaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  searchBarBtn: { width: 44, height: 44, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#999', fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultsContainer: { flex: 1 },
  resultsList: { padding: 20, paddingBottom: 100 },
  resultsListSearch: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13, padding: 40 },
  scrollView: { flex: 1, paddingHorizontal: 20 },
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
  pillCountry: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillTextCountry: { fontSize: 11, fontWeight: '500' },
  pillCount: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  browseAllBtn: { backgroundColor: '#000', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  browseAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  drillHeader: { backgroundColor: '#000', padding: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  drillBack: { padding: 4 },
  drillHeaderContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  drillTitleIcon: { marginRight: 4 },
  drillTitle: { fontSize: 18, fontWeight: '700', color: '#fff', flex: 1 },
  drillCount: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  filterBar: { backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterBarContent: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', flexDirection: 'row' },
  filterBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginRight: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  filterBtnOn: { backgroundColor: '#000', borderColor: '#000' },
  filterBtnText: { fontSize: 16, fontWeight: '600', color: '#111', lineHeight: 22 },
  filterBtnTextOn: { fontSize: 16, fontWeight: '600', color: '#fff', lineHeight: 22 },
  tagsRow: { paddingHorizontal: 20, paddingVertical: 8, maxHeight: 50 },
  tag: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  tagText: { fontSize: 13, color: '#555' },
  downloadToast: {
    position: 'absolute',
    bottom: 72,
    left: 16,
    right: 16,
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  downloadToastText: { color: '#fff', fontSize: 13, marginBottom: 6 },
  downloadToastPct: { color: '#fff', fontSize: 13, fontWeight: '600', position: 'absolute', top: 14, right: 14 },
  downloadToastBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  downloadToastFill: { height: 6, backgroundColor: '#22c55e', borderRadius: 3 },
});
