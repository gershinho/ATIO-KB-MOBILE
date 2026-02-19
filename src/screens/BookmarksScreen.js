import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../data/constants';
import { incrementThumbsUp } from '../database/db';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';
import { generateComparisonSummary } from '../services/aiSummary';

const BOOKMARKS_KEY = 'bookmarkedInnovations';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function BookmarksScreen() {
  const insets = useSafeAreaInsets();
  const { refreshBookmarkCount } = React.useContext(BookmarkCountContext);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  const openComments = (innovation) => {
    setCommentsInnovation(innovation);
  };

  const handleThumbsUp = useCallback(async (innovation) => {
    if (!innovation) return;
    try {
      await incrementThumbsUp(innovation.id);
    } catch (e) {
      console.log('Thumbs up failed:', e);
    }
    setList((prev) =>
      prev.map((item) =>
        item.id === innovation.id ? { ...item, thumbsUpCount: (item.thumbsUpCount ?? 0) + 1 } : item
      )
    );
    setSelectedInnovation((prev) =>
      prev && prev.id === innovation.id ? { ...prev, thumbsUpCount: (prev.thumbsUpCount ?? 0) + 1 } : prev
    );
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setList(arr);
      setBookmarkedIds(new Set(arr.map((i) => i.id)));
      refreshBookmarkCount();
    } catch (e) {
      console.log('Error loading bookmarks:', e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [refreshBookmarkCount]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadBookmarks();
    }, [loadBookmarks])
  );

  useEffect(() => {
    setSelectedForCompare((prev) => prev.filter((id) => list.some((i) => i.id === id)));
  }, [list]);

  const removeBookmark = async (innovation) => {
    const next = list.filter((i) => i.id !== innovation.id);
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
    setList(next);
    setBookmarkedIds(new Set(next.map((i) => i.id)));
    refreshBookmarkCount();
    setSelectedForCompare((prev) => prev.filter((id) => id !== innovation.id));
    if (selectedInnovation?.id === innovation.id) {
      setDrawerVisible(false);
      setSelectedInnovation(null);
    }
  };

  const openDrawer = (innovation) => {
    setSelectedInnovation(innovation);
    setDrawerVisible(true);
  };

  const toggleCompare = (id) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const getComparisonItems = () => {
    if (selectedForCompare.length !== 2) return [null, null];
    const a = list.find((i) => i.id === selectedForCompare[0]);
    const b = list.find((i) => i.id === selectedForCompare[1]);
    return [a || null, b || null];
  };

  const openComparison = () => {
    if (selectedForCompare.length === 2) setShowComparison(true);
  };

  const closeComparison = () => setShowComparison(false);

  const renderItem = ({ item }) => {
    const isSelectedForCompare = selectedForCompare.includes(item.id);
    return (
      <View style={styles.row}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.rowIconBtn} onPress={() => openDrawer(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="expand-outline" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rowIconBtn, isSelectedForCompare && styles.rowIconBtnSelected]}
            onPress={() => toggleCompare(item.id)}
            disabled={!isSelectedForCompare && selectedForCompare.length >= 2}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name={isSelectedForCompare ? 'git-compare' : 'git-compare-outline'} size={22} color={isSelectedForCompare ? '#030213' : '#666'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rowIconBtn} onPress={() => removeBookmark(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={22} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const [item1, item2] = getComparisonItems();
  const canCompare = list.length >= 2 && selectedForCompare.length === 2;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Bookmarks</Text>
        {list.length >= 2 && (
          <TouchableOpacity
            style={[styles.compareBtn, canCompare && styles.compareBtnActive]}
            onPress={openComparison}
            disabled={!canCompare}
          >
            <Ionicons name="git-compare-outline" size={18} color={canCompare ? '#fff' : '#999'} />
            <Text style={[styles.compareBtnText, canCompare && styles.compareBtnTextActive]}>
              Compare ({selectedForCompare.length}/2)
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {list.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
              <Ionicons name="bookmark-outline" size={48} color="#999" />
            </View>
          <Text style={styles.emptyTitle}>No bookmarks yet</Text>
          <Text style={styles.emptyText}>Bookmark solutions from Home to see them here.</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
        />
      )}
      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        startExpanded
        isBookmarked={selectedInnovation ? bookmarkedIds.has(selectedInnovation.id) : false}
        onBookmark={selectedInnovation ? () => removeBookmark(selectedInnovation) : undefined}
        onComments={openComments}
        thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
        onThumbsUp={handleThumbsUp}
      />

      <Modal visible={showComparison} transparent animationType="slide" onRequestClose={closeComparison} statusBarTranslucent>
        <View style={styles.comparisonOverlay}>
          <View style={[styles.comparisonDrawer, { height: SCREEN_HEIGHT - insets.top }]}>
            <TouchableOpacity onPress={closeComparison} style={styles.comparisonHandleWrap}>
              <View style={styles.comparisonHandle} />
            </TouchableOpacity>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonTitle}>Solution Comparison</Text>
              <TouchableOpacity onPress={closeComparison} style={styles.comparisonClose}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.comparisonScroll} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator>
              {item1 && item2 && (
                <ComparisonView item1={item1} item2={item2} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <CommentsModal
        visible={!!commentsInnovation}
        innovation={commentsInnovation}
        onClose={() => setCommentsInnovation(null)}
      />
    </View>
  );
}

const truncate = (str, len) => {
  const s = str || '';
  return s.length > len ? s.slice(0, len) + '…' : s || '—';
};

const SECTION_DISPLAY_NAMES = {
  'use case': 'Use Case',
  'use case(s)': 'Use Case',
  'use cases': 'Use Case',
  approach: 'Approach',
  'complexity + cost': 'Complexity/Cost',
  'complexity/cost': 'Complexity/Cost',
};

function parseAiSummarySections(summary) {
  if (!summary || typeof summary !== 'string') return [];
  const normalized = summary.trim();
  const sectionHeaders = /(?:^|\n)\s*(?:\d+\)\s*)?(USE CASE[S]?|APPROACH|COMPLEXITY\s*[+\/]\s*COST)\s*[:\s]*/gi;
  const parts = normalized.split(sectionHeaders);
  const sections = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const rawTitle = (parts[i] || '').trim();
    const content = (parts[i + 1] || '').trim();
    if (!rawTitle || !content) continue;
    const key = rawTitle.toLowerCase().replace(/\s+/g, ' ').trim();
    const title = SECTION_DISPLAY_NAMES[key] || rawTitle;
    sections.push({ title, content });
  }
  if (sections.length === 0) return [{ title: 'Summary', content: normalized }];
  return sections;
}

function CollapsibleSection({ title, content, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
      </TouchableOpacity>
      {expanded && <Text style={styles.collapsibleContent}>{content}</Text>}
    </View>
  );
}

function ComparisonView({ item1, item2 }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(true);
  const [aiSummaryError, setAiSummaryError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [expandedCells, setExpandedCells] = useState({});
  const toggleCompareCell = (key) => setExpandedCells((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    let cancelled = false;
    setAiSummary(null);
    setAiSummaryError(null);
    setAiSummaryLoading(true);

    const desc1 = (item1?.longDescription || item1?.shortDescription || '').trim();
    const desc2 = (item2?.longDescription || item2?.shortDescription || '').trim();
    if (!desc1 && !desc2) {
      setAiSummary('No descriptions available to compare.');
      setAiSummaryLoading(false);
      return;
    }

    const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (!apiKey || !String(apiKey).trim()) {
      setAiSummaryError('Missing API key. Set EXPO_PUBLIC_OPENAI_API_KEY in .env');
      setAiSummaryLoading(false);
      return;
    }

    generateComparisonSummary(item1, item2)
      .then(({ summary }) => {
        if (!cancelled) {
          setAiSummary(summary);
          setAiSummaryError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAiSummaryError(err?.message || 'Could not generate summary');
        }
      })
      .finally(() => {
        if (!cancelled) setAiSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [item1?.id, item2?.id, retryCount]);

  const readiness1 = READINESS_LEVELS.find((r) => r.level === item1.readinessLevel) || READINESS_LEVELS[0];
  const readiness2 = READINESS_LEVELS.find((r) => r.level === item2.readinessLevel) || READINESS_LEVELS[0];
  const adoption1 = ADOPTION_LEVELS.find((a) => a.level === item1.adoptionLevel) || ADOPTION_LEVELS[0];
  const adoption2 = ADOPTION_LEVELS.find((a) => a.level === item2.adoptionLevel) || ADOPTION_LEVELS[0];
  const pct = (v) => (v != null ? Math.round((Number(v) / 9) * 100) : 0);
  const costLabel = (c) => (c === 'low' ? '$ Low' : c === 'high' ? '$$$ High' : c ? `$$ ${String(c).charAt(0).toUpperCase() + String(c).slice(1)}` : '—');
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
  const loc = (i) => (i.countries?.length ? i.countries.join(', ') : i.region || '—');
  const list = (arr, max = 3) => (arr?.length ? arr.slice(0, max).join(', ') + (arr.length > max ? '…' : '') : '—');
  const sdgBadges = (nums) => (nums?.length ? nums.slice(0, 6).map((n) => ({ num: n, color: SDGS.find((s) => s.number === n)?.color || '#888' })) : []);

  return (
    <View style={styles.compareRoot}>
      <View style={styles.compareTitles}>
        <View style={[styles.compareTitleCell, styles.compareColA]}>
          <Text style={styles.compareColLabel}>A</Text>
          <View style={styles.compareTitleInner}>
            <Text style={styles.compareTitleA} numberOfLines={2}>{item1.title}</Text>
            {item1.isGrassroots && <Ionicons name="leaf-outline" size={16} color="#16a34a" style={styles.compareGrassrootsIcon} />}
          </View>
        </View>
        <View style={styles.compareColDivider} />
        <View style={[styles.compareTitleCell, styles.compareColB]}>
          <Text style={styles.compareColLabel}>B</Text>
          <View style={styles.compareTitleInner}>
            <Text style={styles.compareTitleB} numberOfLines={2}>{item2.title}</Text>
            {item2.isGrassroots && <Ionicons name="leaf-outline" size={16} color="#16a34a" style={styles.compareGrassrootsIcon} />}
          </View>
        </View>
      </View>

      <ComparisonSection title="Summary" icon="document-text-outline">
        <Text style={styles.poweredByAI}>Powered by AI</Text>
        {aiSummaryLoading && (
          <View style={styles.aiSummaryBlock}>
            <ActivityIndicator size="small" color="#64748b" />
            <Text style={styles.aiSummaryLoadingText}>Generating summary…</Text>
          </View>
        )}
        {!aiSummaryLoading && aiSummaryError && (
          <View style={styles.aiSummaryErrorBlock}>
            <Text style={styles.aiSummaryErrorText}>{aiSummaryError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setRetryCount((c) => c + 1)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!aiSummaryLoading && aiSummary && !aiSummaryError && (() => {
          const parsed = parseAiSummarySections(aiSummary);
          return parsed.length > 0 ? (
            parsed.map((sec, idx) => (
              <CollapsibleSection key={idx} title={sec.title} content={sec.content} defaultExpanded={idx === 0} />
            ))
          ) : (
            <Text style={styles.aiSummaryText}>{aiSummary}</Text>
          );
        })()}
      </ComparisonSection>

      <ComparisonSection title="Readiness & adoption" icon="trending-up-outline">
        <View style={styles.compareBarRow}>
          <Text style={styles.compareBarLabel}>Readiness</Text>
          <View style={styles.compareBarPair}>
            <View style={[styles.compareBarCell, styles.compareColA]}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFill, { width: `${pct(item1.readinessLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{readiness1.name}</Text>
            </View>
            <View style={styles.compareColDivider} />
            <View style={[styles.compareBarCell, styles.compareColB]}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFill, { width: `${pct(item2.readinessLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{readiness2.name}</Text>
            </View>
          </View>
        </View>
        <View style={styles.compareBarRow}>
          <Text style={styles.compareBarLabel}>Adoption</Text>
          <View style={styles.compareBarPair}>
            <View style={[styles.compareBarCell, styles.compareColA]}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFillBlue, { width: `${pct(item1.adoptionLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{adoption1.name}</Text>
            </View>
            <View style={styles.compareColDivider} />
            <View style={[styles.compareBarCell, styles.compareColB]}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFillBlue, { width: `${pct(item2.adoptionLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{adoption2.name}</Text>
            </View>
          </View>
        </View>
      </ComparisonSection>

      <ComparisonSection title="Location" icon="location-outline">
        <ComparisonRow label="Where" a={loc(item1)} b={loc(item2)} expandedA={expandedCells['Where-A']} expandedB={expandedCells['Where-B']} onToggleA={() => toggleCompareCell('Where-A')} onToggleB={() => toggleCompareCell('Where-B')} />
      </ComparisonSection>

      {(item1.types?.length || item2.types?.length) > 0 && (
        <ComparisonSection title="Type & focus" icon="pricetag-outline">
          <ComparisonRow label="Types" a={list(item1.types, 4)} b={list(item2.types, 4)} aFull={item1.types?.join(', ')} bFull={item2.types?.join(', ')} expandedA={expandedCells['Types-A']} expandedB={expandedCells['Types-B']} onToggleA={() => toggleCompareCell('Types-A')} onToggleB={() => toggleCompareCell('Types-B')} />
        </ComparisonSection>
      )}

      {(item1.useCases?.length || item2.useCases?.length) > 0 && (
        <ComparisonSection title="Use cases" icon="briefcase-outline">
          <ComparisonRow label="Primary" a={list(item1.useCases)} b={list(item2.useCases)} aFull={item1.useCases?.join(', ')} bFull={item2.useCases?.join(', ')} expandedA={expandedCells['Primary-A']} expandedB={expandedCells['Primary-B']} onToggleA={() => toggleCompareCell('Primary-A')} onToggleB={() => toggleCompareCell('Primary-B')} />
        </ComparisonSection>
      )}

      {(item1.users?.length || item2.users?.length) > 0 && (
        <ComparisonSection title="User groups" icon="people-outline">
          <ComparisonRow label="Intended for" a={list(item1.users)} b={list(item2.users)} aFull={item1.users?.join(', ')} bFull={item2.users?.join(', ')} expandedA={expandedCells['Intended for-A']} expandedB={expandedCells['Intended for-B']} onToggleA={() => toggleCompareCell('Intended for-A')} onToggleB={() => toggleCompareCell('Intended for-B')} />
        </ComparisonSection>
      )}

      {((item1.sdgs?.length || item2.sdgs?.length) > 0) && (
        <ComparisonSection title="SDG alignment" icon="ribbon-outline">
          <View style={styles.compareSdgRow}>
            <View style={[styles.compareSdgCol, styles.compareColA]}>
              {sdgBadges(item1.sdgs).map(({ num, color }) => (
                <View key={`1-${num}`} style={[styles.compareSdgBadge, { backgroundColor: color }]}>
                  <Text style={styles.compareSdgNum}>{num}</Text>
                </View>
              ))}
              {(!item1.sdgs?.length) && <Text style={styles.compareMuted}>—</Text>}
            </View>
            <View style={styles.compareColDivider} />
            <View style={[styles.compareSdgCol, styles.compareColB]}>
              {sdgBadges(item2.sdgs).map(({ num, color }) => (
                <View key={`2-${num}`} style={[styles.compareSdgBadge, { backgroundColor: color }]}>
                  <Text style={styles.compareSdgNum}>{num}</Text>
                </View>
              ))}
              {(!item2.sdgs?.length) && <Text style={styles.compareMuted}>—</Text>}
            </View>
          </View>
        </ComparisonSection>
      )}

      <ComparisonSection title="Source" icon="library-outline">
        <ComparisonRow label="Source" a={item1.dataSource || '—'} b={item2.dataSource || '—'} expandedA={expandedCells['Source-A']} expandedB={expandedCells['Source-B']} onToggleA={() => toggleCompareCell('Source-A')} onToggleB={() => toggleCompareCell('Source-B')} />
        <ComparisonRow label="Owner / partner" a={item1.owner || item1.partner || '—'} b={item2.owner || item2.partner || '—'} expandedA={expandedCells['Owner / partner-A']} expandedB={expandedCells['Owner / partner-B']} onToggleA={() => toggleCompareCell('Owner / partner-A')} onToggleB={() => toggleCompareCell('Owner / partner-B')} />
      </ComparisonSection>
    </View>
  );
}

function ComparisonSection({ title, icon, children }) {
  return (
    <View style={styles.compareSection}>
      <View style={styles.compareSectionHeader}>
        <Ionicons name={icon} size={14} color="#64748b" />
        <Text style={styles.compareSectionTitle}>{title}</Text>
      </View>
      <View style={styles.compareSectionBody}>{children}</View>
    </View>
  );
}

const TRUNCATE_THRESHOLD = 60; // chars beyond which 2-line clamp likely hides content

function ComparisonRow({ label, a, b, aFull, bFull, expandedA, expandedB, onToggleA, onToggleB }) {
  const shortA = a || '—';
  const shortB = b || '—';
  const textA = expandedA && (aFull != null && aFull !== '') ? (aFull || '—') : shortA;
  const textB = expandedB && (bFull != null && bFull !== '') ? (bFull || '—') : shortB;
  const hasContentA = shortA !== '—' && String(shortA).trim().length > 0;
  const hasContentB = shortB !== '—' && String(shortB).trim().length > 0;
  const hasMoreA = hasContentA && (aFull != null && aFull !== '' ? aFull !== shortA : String(shortA).length > TRUNCATE_THRESHOLD);
  const hasMoreB = hasContentB && (bFull != null && bFull !== '' ? bFull !== shortB : String(shortB).length > TRUNCATE_THRESHOLD);
  const canExpandA = hasMoreA && onToggleA;
  const canExpandB = hasMoreB && onToggleB;
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareRowLabel}>{label}</Text>
      <View style={styles.compareRowCells}>
        <View style={[styles.compareCellWrap, styles.compareColA]}>
          <TouchableOpacity onPress={canExpandA && onToggleA ? onToggleA : undefined} activeOpacity={canExpandA ? 0.7 : 1} disabled={!canExpandA}>
            <Text style={styles.compareCellA} numberOfLines={expandedA ? undefined : 2} ellipsizeMode={expandedA ? undefined : 'tail'}>{textA}</Text>
            {canExpandA && !expandedA && <Text style={styles.compareCellMore}>more</Text>}
            {canExpandA && expandedA && onToggleA && <TouchableOpacity onPress={onToggleA}><Text style={styles.compareCellLess}>Show less</Text></TouchableOpacity>}
          </TouchableOpacity>
        </View>
        <View style={styles.compareColDivider} />
        <View style={[styles.compareCellWrap, styles.compareColB]}>
          <TouchableOpacity onPress={canExpandB && onToggleB ? onToggleB : undefined} activeOpacity={canExpandB ? 0.7 : 1} disabled={!canExpandB}>
            <Text style={styles.compareCellB} numberOfLines={expandedB ? undefined : 2} ellipsizeMode={expandedB ? undefined : 'tail'}>{textB}</Text>
            {canExpandB && !expandedB && <Text style={styles.compareCellMore}>more</Text>}
            {canExpandB && expandedB && onToggleB && <TouchableOpacity onPress={onToggleB}><Text style={styles.compareCellLess}>Show less</Text></TouchableOpacity>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  header: { fontSize: 22, fontWeight: '700', color: '#111' },
  compareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f0f0f0' },
  compareBtnActive: { backgroundColor: '#030213' },
  compareBtnText: { fontSize: 14, color: '#999', fontWeight: '600' },
  compareBtnTextActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111', marginRight: 12, lineHeight: 20 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowIconBtnSelected: { backgroundColor: '#f0f0f0' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
  comparisonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  comparisonDrawer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  comparisonHandleWrap: { paddingVertical: 12, alignItems: 'center' },
  comparisonHandle: { width: 48, height: 4, backgroundColor: '#ddd', borderRadius: 2 },
  comparisonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  comparisonTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  comparisonClose: { padding: 4 },
  comparisonScroll: { flex: 1 },
  compareRoot: { padding: 16, paddingBottom: 8 },
  compareTitles: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  compareTitleCell: { flex: 1, minWidth: 0 },
  compareColLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4, letterSpacing: 0.5 },
  compareTitleInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  compareColA: { flex: 1, paddingRight: 8 },
  compareColB: { flex: 1, paddingLeft: 8 },
  compareColDivider: { width: 1, backgroundColor: '#e2e8f0', marginVertical: 2 },
  compareTitleA: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  compareTitleB: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  compareGrassrootsIcon: { marginTop: 2 },
  compareCellWrap: { flex: 1, minWidth: 0 },
  collapsibleSection: { marginBottom: 12 },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  collapsibleTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  collapsibleContent: { fontSize: 13, color: '#334155', lineHeight: 20, paddingLeft: 0, paddingBottom: 8 },
  compareSection: { marginBottom: 20 },
  compareSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  compareSectionTitle: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5 },
  compareSectionBody: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  poweredByAI: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 8, letterSpacing: 0.3 },
  aiSummaryBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aiSummaryErrorBlock: { marginBottom: 12 },
  aiSummaryLoadingText: { fontSize: 13, color: '#64748b' },
  aiSummaryErrorText: { fontSize: 13, color: '#dc2626', marginBottom: 8 },
  retryBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e2e8f0', borderRadius: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  aiSummaryText: { fontSize: 13, color: '#334155', lineHeight: 20, marginBottom: 12 },
  compareRow: { marginBottom: 10 },
  compareRowLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  compareRowCells: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  compareCellA: { fontSize: 13, color: '#334155', lineHeight: 18 },
  compareCellB: { fontSize: 13, color: '#334155', lineHeight: 18 },
  compareCellMore: { fontSize: 12, color: '#3b82f6', marginTop: 2 },
  compareCellLess: { fontSize: 12, color: '#3b82f6', marginTop: 4 },
  compareBarRow: { marginBottom: 12 },
  compareBarLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  compareBarPair: { flexDirection: 'row', gap: 0 },
  compareBarCell: { flex: 1, minWidth: 0 },
  compareBarBg: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  compareBarFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  compareBarFillBlue: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  compareBarVal: { fontSize: 10, color: '#64748b', lineHeight: 14 },
  compareSdgRow: { flexDirection: 'row', gap: 12 },
  compareSdgCol: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  compareSdgBadge: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  compareSdgNum: { color: '#fff', fontSize: 11, fontWeight: '700' },
  compareMuted: { fontSize: 13, color: '#94a3b8' },
});
