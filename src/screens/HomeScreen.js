import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Keyboard,
  LayoutAnimation, UIManager, Animated,
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiSearch } from '../config/api';
import { CHALLENGES, TYPES } from '../data/constants';
import {
  initDatabase,
  getStats,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
  searchInnovations,
  getRecentInnovations,
  getHelpInnovations,
  countInnovations,
  incrementThumbsUp,
  decrementThumbsUp,
} from '../database/db';
import { downloadInnovationToFile } from '../utils/downloadInnovation';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import { DownloadCompleteContext } from '../context/DownloadCompleteContext';
import { AccessibilityContext } from '../context/AccessibilityContext';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import FilterPanel from '../components/FilterPanel';
import CommentsModal from '../components/CommentsModal';
import { getActiveFilterTags, getFiltersAfterRemove } from '../utils/activeFilterTags';
import useSpeechToText from '../hooks/useSpeechToText';
import AtiobotMagnifyingGlass from '../../assets/Atiobot-magnifying-glass.svg';
import AtioIcon from '../../assets/ATIO ICON1.svg';
import AtiobotPose3 from '../../assets/ATIOBOT poses 3 .svg';

const BOOKMARKS_KEY = 'bookmarkedInnovations';
const DOWNLOADS_KEY = 'completedDownloads';
const LIKES_KEY = 'likedInnovations';

function BouncingLoader({ width = 80, height = 66, style, reduceMotion = false }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce, reduceMotion]);
  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      <AtiobotPose3 width={width} height={height} />
    </Animated.View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { refreshBookmarkCount } = React.useContext(BookmarkCountContext);
  const { triggerDownloadComplete } = React.useContext(DownloadCompleteContext);
  const { reduceMotion, getScaledSize, colorBlindMode } = React.useContext(AccessibilityContext);
  const containerStyle = [styles.container, { paddingTop: insets.top }];
  const [mode, setMode] = useState('search'); // 'search' | 'explore'

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchBarExpanded, setSearchBarExpanded] = useState(false);
  const currentQueryRef = React.useRef('');

  // Explore state
  const [exploreLoading, setExploreLoading] = useState(true);
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
  const [helpInnovations, setHelpInnovations] = useState([]);
  const [helpLoading, setHelpLoading] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);

  const DRILLDOWN_PAGE_SIZE = 10;
  const [activeFilters, setActiveFilters] = useState({});
  const [drilldownEntryFilters, setDrilldownEntryFilters] = useState(null);

  // Expand challenges/types into challengeKeywords/typeKeywords so FilterPanel shows entry selection with all sub-terms selected
  const panelInitialFilters = React.useMemo(() => {
    const f = { ...activeFilters };
    if (activeFilters.challenges?.length && !(activeFilters.challengeKeywords?.length > 0)) {
      const kws = [];
      for (const id of activeFilters.challenges) {
        const c = CHALLENGES.find((ch) => ch.id === id);
        if (c?.subTerms) for (const st of c.subTerms) kws.push(st.keyword);
      }
      f.challengeKeywords = kws;
    }
    if (activeFilters.types?.length && !(activeFilters.typeKeywords?.length > 0)) {
      const kws = [];
      for (const id of activeFilters.types) {
        const t = TYPES.find((ty) => ty.id === id);
        if (t?.subTerms) for (const st of t.subTerms) kws.push(st.keyword);
      }
      f.typeKeywords = kws;
    }
    return f;
  }, [activeFilters]);

  // Shared
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerStartExpanded, setDrawerStartExpanded] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [bookmarksList, setBookmarksList] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const searchAfterSpeechRef = React.useRef(false);
  const [downloadToast, setDownloadToast] = useState(null);

  const { isListening: isRecording, isTranscribing, toggle: toggleSpeech } = useSpeechToText(
    useCallback((text, isFinal) => {
      setQuery(text);
      if (isFinal && text.trim()) searchAfterSpeechRef.current = true;
    }, [])
  );

  useEffect(() => {
    if (searchAfterSpeechRef.current && query.trim() && !isRecording) {
      searchAfterSpeechRef.current = false;
      handleSearch();
    }
  }, [isRecording, query]);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  // Warm up the SQLite database in the background so Explore loads faster later.
  useEffect(() => {
    initDatabase().catch((e) => {
      console.log('initDatabase warmup failed:', e);
    });
  }, []);

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

  const loadLikes = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LIKES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setLikedIds(new Set(arr));
    } catch (e) {
      console.log('Error loading likes:', e);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
    loadLikes();
  }, [loadBookmarks, loadLikes]);

  useFocusEffect(
    useCallback(() => {
      loadBookmarks();
    }, [loadBookmarks])
  );

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Load "Seek further help" for no-results empty states (search + drilldown)
  const HELP_QUERIES = ['hotlines and helplines', 'hotline', 'help', 'helpline'];
  const HELP_PAGE_SIZE = 100;
  useEffect(() => {
    let cancelled = false;
    setHelpLoading(true);
    async function fetchAllQueries() {
      try {
        const byId = new Map();
        for (const q of HELP_QUERIES) {
          if (cancelled) break;
          let offset = 0;
          let hasMore = true;
          while (hasMore && !cancelled) {
            const data = await aiSearch(q, offset, HELP_PAGE_SIZE);
            const page = data.results || [];
            for (const item of page) {
              const id = item.id;
              const score = item.matchScore ?? 0;
              const existing = byId.get(id);
              if (!existing || (existing.matchScore ?? 0) < score) {
                byId.set(id, { ...item, matchScore: score });
              }
            }
            hasMore = data.hasMore || false;
            offset += page.length;
          }
        }
        if (!cancelled) {
          const titleKeywords = /hotline|helpline|help|service/i;
          const hasTitleMatch = (item) => titleKeywords.test(item.title || '');
          const merged = Array.from(byId.values()).sort((a, b) => {
            const aFirst = hasTitleMatch(a) ? 1 : 0;
            const bFirst = hasTitleMatch(b) ? 1 : 0;
            if (bFirst !== aFirst) return bFirst - aFirst;
            return (b.matchScore ?? 0) - (a.matchScore ?? 0);
          });
          setHelpInnovations(merged);
        }
      } catch (e) {
        if (!cancelled) {
          console.log('Help section AI search failed, using local fallback:', e);
          const fallback = await getHelpInnovations(500);
          setHelpInnovations(fallback);
        }
      } finally {
        if (!cancelled) setHelpLoading(false);
      }
    }
    fetchAllQueries();
    return () => { cancelled = true; };
  }, []);

  // Reset to pre-search state when user taps Home tab while already on Home
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (isFocused) {
        setHasSearched(false);
        setQuery('');
        setResults([]);
        setHasMore(false);
        setSearchError(null);
        setMode('search');
        setDrilldownVisible(false);
        setDrawerVisible(false);
        setSelectedInnovation(null);
      }
    });
    return unsubscribe;
  }, [navigation, isFocused]);

  const handleThumbsUp = useCallback(
    async (innovation) => {
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

      setResults((prev) => adjustList(prev));
      setRecentInnovations((prev) => adjustList(prev));
      setDrilldownResults((prev) => adjustList(prev));
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
    },
    [likedIds]
  );

  const handleCommentAdded = useCallback((innovationId) => {
    const bump = (list) =>
      Array.isArray(list)
        ? list.map((item) =>
            item.id === innovationId
              ? {
                  ...item,
                  commentCount: (item.commentCount ?? 0) + 1,
                }
              : item
          )
        : list;

    setResults((prev) => bump(prev));
    setRecentInnovations((prev) => bump(prev));
    setDrilldownResults((prev) => bump(prev));
    setSelectedInnovation((prev) =>
      prev && prev.id === innovationId
        ? {
            ...prev,
            commentCount: (prev.commentCount ?? 0) + 1,
          }
        : prev
    );
    setCommentsInnovation((prev) =>
      prev && prev.id === innovationId
        ? {
            ...prev,
            commentCount: (prev.commentCount ?? 0) + 1,
          }
        : prev
    );
  }, []);

  const toggleBookmark = useCallback(async (innovation) => {
    if (!innovation) return;
    const id = innovation.id;
    const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
    const currentList = raw ? JSON.parse(raw) : [];
    const isCurrentlyBookmarked = currentList.some((i) => i.id === id);
    let nextList;
    if (isCurrentlyBookmarked) {
      nextList = currentList.filter((i) => i.id !== id);
    } else {
      nextList = [{ ...innovation, bookmarkedAt: Date.now() }, ...currentList];
    }
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextList));
    setBookmarkedIds(new Set(nextList.map((i) => i.id)));
    setBookmarksList(nextList);
    refreshBookmarkCount();
  }, [refreshBookmarkCount]);

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
        // Always persist to in‑app Downloads first so the innovation is available
        // for offline reading inside the app, regardless of export/share support.
        const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (!arr.some((i) => i.id === innovation.id)) {
          const next = [{ ...innovation, downloadedAt: Date.now() }, ...arr];
          await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
        }
        if (!cancelled) {
          triggerDownloadComplete();
        }

        // Best‑effort export to a shareable file (PDF/text). If this fails, the
        // innovation remains available in the Downloads tab for offline viewing.
        const result = await downloadInnovationToFile(innovation);
        if (!cancelled && !result.success) {
          Alert.alert(
            'Export failed',
            result.error || 'Saved in the Downloads tab, but the file could not be exported.'
          );
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            'Export failed',
            e?.message || 'Innovation is saved in the Downloads tab, but the file export failed.'
          );
        }
      } finally {
        if (!cancelled) setDownloadToast(null);
      }
    })();
    return () => { cancelled = true; };
  }, [downloadToast?.progress, downloadToast?.id]);

  const AI_PAGE_SIZE = 5;

  const handleSearch = async () => {
    Keyboard.dismiss();
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchBarExpanded(false);
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setHasSearched(true);
    setSearchError(null);
    setResults([]);
    setHasMore(false);
    currentQueryRef.current = trimmed;
    try {
      const data = await aiSearch(trimmed, 0, AI_PAGE_SIZE);
      const sorted = (data.results || []).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      setResults(sorted);
      setHasMore(data.hasMore || false);
    } catch (e) {
      console.log('AI Search error:', e);
      setSearchError(e.message || 'Search failed. Please check your connection.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await aiSearch(currentQueryRef.current, results.length, AI_PAGE_SIZE);
      const appended = [...results, ...(data.results || [])].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      setResults(appended);
      setHasMore(data.hasMore || false);
    } catch (e) {
      console.log('Load more error:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, results.length]);

  const loadExploreData = useCallback(async () => {
    setExploreLoading(true);
    setLoadError(null);
    try {
      const [s, ri] = await Promise.all([
        getStats(),
        getRecentInnovations(5),
      ]);
      setStats(s);
      setRecentInnovations(ri);
      setExploreLoading(false);

      const [tr, cc, tyc] = await Promise.all([
        getTopRegions(15),
        getChallengeCounts(),
        getTypeCounts(),
      ]);
      setTopRegions(tr);
      setChallengeCounts(cc);
      setTypeCounts(tyc);
    } catch (e) {
      setLoadError(e?.message || String(e));
      setExploreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'explore') loadExploreData();
  }, [mode, loadExploreData]);

  const openDrillByChallenge = async (challenge) => {
    setDrilldownTitle(challenge.name);
    setDrilldownIcon(challenge.icon);
    setDrilldownIconColor(challenge.iconColor || '#333');
    setDrilldownVisible(true);
    setDrilldownLoading(true);
    setActiveFilters({ challenges: [challenge.id] });
    setDrilldownEntryFilters({ challengeKeywords: challenge.keywords || [] });
    try {
      const filters = { challenges: [challenge.id] };
      const [res, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
      setDrilldownHasMore(res.length < count);
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
    setDrilldownEntryFilters({ typeKeywords: type.keywords || [] });
    try {
      const filters = { types: [type.id] };
      const [res, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
      setDrilldownHasMore(res.length < count);
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
    setDrilldownEntryFilters({ hubRegions: [region.id] });
    try {
      const filters = { hubRegions: [region.id] };
      const [res, count] = await Promise.all([
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
      setDrilldownHasMore(res.length < count);
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
    setDrilldownEntryFilters({});
    try {
      const [res, count] = await Promise.all([
        searchInnovations({}, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations({}),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
      setDrilldownHasMore(res.length < count);
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
        searchInnovations(filters, DRILLDOWN_PAGE_SIZE, 0),
        countInnovations(filters),
      ]);
      setDrilldownResults(res);
      setDrilldownCount(count);
      setDrilldownHasMore(res.length < count);
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

  const openDrawer = (innovation, startExpanded = false) => {
    setSelectedInnovation(innovation);
    setDrawerStartExpanded(startExpanded);
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
      commentCount={item.commentCount ?? 0}
      isLiked={likedIds.has(item.id)}
    />
  );

  // —— Search content ——
  const searchContent = () => {
    if (!hasSearched) {
      return (
        <View style={styles.heroSection}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <AtioIcon width={20} height={20} />
            </View>
            <Text style={styles.logoText}>ATIO KB Solutions</Text>
          </View>
          <Text style={styles.heroTitle}>Explore solutions we're growing together</Text>
          <Text style={styles.heroSubtitle}>Making knowledge into action · Powered by AI</Text>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search solutions, challenges, or ideas..."
              placeholderTextColor="#999"
              multiline
              scrollEnabled
              value={query}
              onChangeText={setQuery}
            />
            <TouchableOpacity
              style={[styles.micBtn, (isRecording || isTranscribing) && styles.micBtnActive]}
              onPress={toggleSpeech}
              activeOpacity={0.7}
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={20} color={isRecording ? '#fff' : '#666'} />
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Search Solutions</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const expandSearch = () => {
      if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSearchBarExpanded(true);
    };
    const collapseSearch = () => {
      if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSearchBarExpanded(false);
    };

    return (
      <View style={styles.searchContentWrap}>
        <View style={[styles.searchBarRow, searchBarExpanded && styles.searchBarRowExpanded]}>
          {searchBarExpanded ? (
            <View style={styles.searchExpandedCard}>
              <Text style={[styles.searchExpandedLabel, { fontSize: getScaledSize(14) }]}>Refine your search</Text>
              <TextInput
                style={[styles.searchExpandedInput, { fontSize: getScaledSize(16) }]}
                value={query}
                onChangeText={setQuery}
                placeholder="What would you like to explore? Solutions, challenges, or ideas..."
                placeholderTextColor="#999"
                multiline
                onBlur={collapseSearch}
                onSubmitEditing={handleSearch}
              />
              <View style={styles.searchExpandedActions}>
                <TouchableOpacity
                  style={[styles.searchExpandedMicBtn, (isRecording || isTranscribing) && styles.micBtnActive]}
                  onPress={toggleSpeech}
                  activeOpacity={0.7}
                  disabled={isTranscribing}
                >
                  {isTranscribing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={22} color={isRecording ? '#fff' : '#374151'} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.searchExpandedPrimaryBtn}
                  onPress={handleSearch}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={[styles.searchExpandedPrimaryLabel, { fontSize: getScaledSize(15) }]}>Search Solutions</Text>
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
        <View style={styles.searchContentArea}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
              <Text style={[styles.aiLoadingText, { fontSize: getScaledSize(13), marginTop: getScaledSize(8) }]}>AI is finding the best solutions...</Text>
            </View>
          ) : searchError ? (
            <View style={styles.searchErrorWrap}>
              <Ionicons name="warning-outline" size={32} color="#d97706" />
              <Text style={styles.searchErrorText}>{searchError}</Text>
              <TouchableOpacity style={styles.searchRetryBtn} onPress={handleSearch}>
                <Text style={styles.searchRetryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.searchResultsWrap}>
            <View style={styles.resultsContainer}>
              <View style={styles.poweredByRow}>
                <View style={styles.poweredByLine} />
                <View style={styles.poweredByLabelWrap}>
                  <Text style={styles.poweredByResults}>Powered by AI</Text>
                </View>
                <View style={styles.poweredByLine} />
              </View>
              <FlatList
                data={results}
                keyExtractor={(item) => String(item.id)}
                style={styles.searchResultsList}
                contentContainerStyle={results.length === 0 ? styles.resultsListSearchEmpty : styles.resultsListSearch}
                renderItem={({ item }) => renderCard(item)}
                ListEmptyComponent={
                  <View style={styles.emptyStateWrap}>
                    <View style={styles.emptyStateMessageWrap}>
                      <AtiobotMagnifyingGlass width={120} height={77} style={styles.emptyStateIcon} />
                      <Text style={styles.emptyStateTitle}>No solutions found for your search</Text>
                      <Text style={styles.emptyStateSubtitle}>
                        We couldn't find any innovations matching your query. Below are hotlines and helplines that may help.
                      </Text>
                    </View>
                    <View style={styles.seekFurtherHeader}>
                      <Text style={styles.seekFurtherTitle}>Seek further help</Text>
                      <View style={styles.seekFurtherScrollHint}>
                        <Ionicons name="chevron-down" size={14} color="#6b7280" />
                        <Text style={styles.seekFurtherScrollHintText}>Scroll for more</Text>
                      </View>
                    </View>
                    {helpLoading ? (
                      <View style={styles.helpCardsLoading}>
                        <ActivityIndicator size="small" color="#22c55e" />
                      </View>
                    ) : (
                      <ScrollView
                        style={styles.emptyStateHelpScroll}
                        contentContainerStyle={styles.helpCardsScrollContent}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                      >
                        {helpInnovations.map((item) => (
                          <View key={item.id} style={styles.helpCard}>
                            <Text style={styles.helpCardTitle} numberOfLines={2}>{item.title}</Text>
                            <View style={styles.helpCardActions}>
                              <TouchableOpacity
                                style={styles.helpCardExpandBtn}
                                onPress={() => openDrawer(item, true)}
                                activeOpacity={0.7}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                              >
                                <Ionicons name="expand-outline" size={22} color="#333" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.helpCardBookmarkBtn, bookmarkedIds.has(item.id) && styles.helpCardBookmarkBtnActive]}
                                onPress={() => toggleBookmark(item)}
                                activeOpacity={0.7}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                              >
                                <Ionicons
                                  name={bookmarkedIds.has(item.id) ? 'bookmark' : 'bookmark-outline'}
                                  size={18}
                                  color={bookmarkedIds.has(item.id) ? '#fff' : '#333'}
                                />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                }
                ListFooterComponent={
                  hasMore ? (
                    <View style={styles.footerLoader}>
                      <ActivityIndicator size="small" color="#22c55e" />
                      <Text style={styles.footerLoaderText}>Loading more innovations...</Text>
                    </View>
                  ) : null
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.3}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
          )}
          {searchBarExpanded && (
            <TouchableWithoutFeedback onPress={collapseSearch}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          )}
        </View>
      </View>
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
          <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
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

  // —— Explore: drilldown view (Search/Explore pill + header with colored icon + cards) ——
  if (mode === 'explore' && drilldownVisible) {
    return (
      <View style={containerStyle}>
        <View style={styles.pillWrap}>
          <TouchableOpacity
            style={[styles.pill, mode === 'search' && styles.pillActive]}
            onPress={() => { setMode('search'); setDrilldownVisible(false); }}
          >
            <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, mode === 'explore' && styles.pillActive]}
            onPress={() => setDrilldownVisible(false)}
          >
            <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.drilldownHeader}>
          <TouchableOpacity
            style={styles.drilldownBackBtn}
            onPress={() => setDrilldownVisible(false)}
            accessibilityLabel="Back to Explore"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          {drilldownIcon ? (
            <View style={[styles.drilldownHeaderIconWrap, { backgroundColor: drilldownIconColor + '20' }]}>
              <Ionicons name={drilldownIcon} size={24} color={drilldownIconColor} />
            </View>
          ) : null}
          <View style={styles.drilldownHeaderTitleWrap}>
            <Text style={styles.drilldownHeaderTitle} numberOfLines={1}>{drilldownTitle}</Text>
            <Text style={styles.drilldownHeaderCount}>
              {drilldownLoading ? '…' : `${drilldownCount} innovation${drilldownCount === 1 ? '' : 's'}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.drilldownHeaderSliders}
            onPress={() => setFilterVisible(true)}
            accessibilityLabel="Filters"
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <FilterPanel
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          onApply={(filters) => { applyFilters(filters); setFilterVisible(false); }}
          initialFilters={panelInitialFilters}
          entryFilters={drilldownEntryFilters}
        />
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
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : (
          <FlatList
            data={drilldownResults}
            keyExtractor={(item) => String(item.id)}
            style={styles.drilldownList}
            contentContainerStyle={drilldownResults.length === 0 ? styles.resultsListSearchEmpty : styles.resultsList}
            renderItem={({ item }) => renderCard(item)}
            ListEmptyComponent={
              <View style={styles.emptyStateWrap}>
                <View style={styles.emptyStateMessageWrap}>
                  <AtiobotMagnifyingGlass width={120} height={77} style={styles.emptyStateIcon} />
                  <Text style={styles.emptyStateTitle}>No innovations found</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    We couldn't find any innovations in this category. Below are hotlines and helplines that may help.
                  </Text>
                </View>
                <View style={styles.seekFurtherHeader}>
                  <Text style={styles.seekFurtherTitle}>Seek further help</Text>
                  <View style={styles.seekFurtherScrollHint}>
                    <Ionicons name="chevron-down" size={14} color="#6b7280" />
                    <Text style={styles.seekFurtherScrollHintText}>Scroll for more</Text>
                  </View>
                </View>
                {helpLoading ? (
                  <View style={styles.helpCardsLoading}>
                    <ActivityIndicator size="small" color="#22c55e" />
                  </View>
                ) : (
                  <ScrollView
                    style={styles.emptyStateHelpScroll}
                    contentContainerStyle={styles.helpCardsScrollContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {helpInnovations.map((item) => (
                      <View key={item.id} style={styles.helpCard}>
                        <Text style={styles.helpCardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.helpCardActions}>
                          <TouchableOpacity
                            style={styles.helpCardExpandBtn}
                            onPress={() => openDrawer(item, true)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons name="expand-outline" size={22} color="#333" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.helpCardBookmarkBtn, bookmarkedIds.has(item.id) && styles.helpCardBookmarkBtnActive]}
                            onPress={() => toggleBookmark(item)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons
                              name={bookmarkedIds.has(item.id) ? 'bookmark' : 'bookmark-outline'}
                              size={18}
                              color={bookmarkedIds.has(item.id) ? '#fff' : '#333'}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            }
            ListFooterComponent={
              drilldownHasMore && drilldownLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#22c55e" />
                  <Text style={styles.footerLoaderText}>Loading more innovations...</Text>
                </View>
              ) : null
            }
            onEndReached={handleLoadMoreDrilldown}
            onEndReachedThreshold={0.3}
          />
        )}
        <DetailDrawer
          innovation={selectedInnovation}
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          startExpanded={drawerStartExpanded}
          isBookmarked={selectedInnovation ? bookmarkedIds.has(selectedInnovation.id) : false}
          onBookmark={selectedInnovation ? () => toggleBookmark(selectedInnovation) : undefined}
          onDownload={selectedInnovation ? () => addDownload(selectedInnovation) : undefined}
          thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
          onThumbsUp={handleThumbsUp}
          isLiked={selectedInnovation ? likedIds.has(selectedInnovation.id) : false}
          commentCount={selectedInnovation?.commentCount ?? 0}
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
            <Ionicons name={c.icon} size={22} color={c.iconColor || '#333'} />
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
            <Ionicons name={t.icon} size={22} color={t.iconColor || '#333'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gridName}>{t.name}</Text>
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
            style={styles.pillCountry}
            onPress={() => openDrillByRegion(r)}
            activeOpacity={0.7}
          >
            <Text style={styles.pillTextCountry} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.pillCount}>{r.count}</Text>
          </TouchableOpacity>
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
        startExpanded={drawerStartExpanded}
        isBookmarked={selectedInnovation ? bookmarkedIds.has(selectedInnovation.id) : false}
        onBookmark={selectedInnovation ? () => toggleBookmark(selectedInnovation) : undefined}
        onDownload={selectedInnovation ? () => addDownload(selectedInnovation) : undefined}
        thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
        onThumbsUp={handleThumbsUp}
        isLiked={selectedInnovation ? likedIds.has(selectedInnovation.id) : false}
        commentCount={selectedInnovation?.commentCount ?? 0}
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
        onCommentAdded={handleCommentAdded}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  pillWrap: { flexDirection: 'row', backgroundColor: '#f3f3f3', marginHorizontal: 20, marginTop: 12, marginBottom: 8, borderRadius: 999, padding: 4 },
  pill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  drilldownHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 16, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  drilldownBackBtn: { padding: 8, marginRight: 4 },
  drilldownHeaderSliders: { padding: 8, marginRight: -8 },
  drilldownHeaderIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drilldownHeaderTitleWrap: { flex: 1, minWidth: 0 },
  drilldownHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  drilldownHeaderCount: { fontSize: 13, color: '#64748b', marginTop: 2 },
  filterChipsWrap: { minHeight: 44, flexShrink: 0, backgroundColor: '#fff', paddingVertical: 8, marginBottom: 4 },
  filterChipsScroll: { flexGrow: 0 },
  filterChipsContent: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', paddingVertical: 2, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingLeft: 10, paddingVertical: 6, paddingRight: 6, marginRight: 6, maxWidth: 160, minHeight: 32 },
  filterChipText: { fontSize: 12, fontWeight: '600', flex: 1 },
  filterChipClose: { marginLeft: 4 },
  drilldownList: { flex: 1 },
  pillActive: { backgroundColor: '#000' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#666' },
  pillTextActive: { color: '#fff' },
  heroSection: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  logoIcon: { width: 32, height: 32, backgroundColor: '#22c55e', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  heroTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 20 },
  searchInputWrap: { position: 'relative', marginBottom: 0, alignSelf: 'stretch' },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, paddingBottom: 44, fontSize: 13, minHeight: 148, height: 148, textAlignVertical: 'top' },
  micBtn: { position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: '#dc2626' },
  poweredByRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: -8 },
  poweredByLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  poweredByLabelWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 4 },
  poweredByResults: { color: '#999', fontSize: 10 },
  searchBtn: { backgroundColor: '#000', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12, alignSelf: 'stretch' },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
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
  searchContentWrap: { flex: 1, minHeight: 0 },
  searchContentArea: { flex: 1, minHeight: 0, position: 'relative' },
  searchResultsWrap: { flex: 1, minHeight: 0 },
  searchResultsList: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  aiLoadingText: { color: '#999', fontSize: 13, marginTop: 8 },
  searchErrorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  searchErrorText: { textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 20 },
  searchRetryBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  searchRetryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  footerLoader: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  footerLoaderText: { color: '#999', fontSize: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#999', fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultsContainer: { flex: 1 },
  resultsList: { padding: 20, paddingBottom: 100 },
  resultsListSearch: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100 },
  resultsListSearchEmpty: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100, flexGrow: 1 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13, padding: 40 },
  emptyStateWrap: { flex: 1, paddingBottom: 24 },
  emptyStateMessageWrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  emptyStateIcon: { marginBottom: 12 },
  emptyStateTitle: { fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  emptyStateSubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  seekFurtherHeader: { marginTop: 40 },
  seekFurtherTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 4 },
  seekFurtherScrollHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  seekFurtherScrollHintText: { fontSize: 12, color: '#6b7280' },
  helpCardsLoading: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  helpCardsScrollContent: { paddingRight: 8, paddingBottom: 12 },
  emptyStateHelpScroll: { height: 220 },
  helpCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  helpCardTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111', marginRight: 8 },
  helpCardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpCardExpandBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCardBookmarkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCardBookmarkBtnActive: { backgroundColor: '#2563eb' },
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
