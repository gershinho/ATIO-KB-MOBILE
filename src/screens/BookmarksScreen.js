import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadInnovationToFile } from '../utils/downloadInnovation';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../data/constants';
import { incrementThumbsUp } from '../database/db';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';

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

  const handleThumbsUp = useCallback(async (innovation) => {
    if (!innovation) return;
    try {
      await incrementThumbsUp(innovation.id);
    } catch (e) {
      console.log('Thumbs up failed:', e);
    }
    const bump = (listVal) =>
      Array.isArray(listVal)
        ? listVal.map((item) =>
            item.id === innovation.id
              ? { ...item, thumbsUpCount: (item.thumbsUpCount ?? 0) + 1 }
              : item
          )
        : listVal;
    setList((prev) => bump(prev));
    setSelectedInnovation((prev) =>
      prev && prev.id === innovation.id
        ? { ...prev, thumbsUpCount: (prev.thumbsUpCount ?? 0) + 1 }
        : prev
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadBookmarks();
    }, [loadBookmarks])
  );

  const removeBookmark = async (innovation) => {
    const next = list.filter((i) => i.id !== innovation.id);
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
    setList(next);
    setBookmarkedIds(new Set(next.map((i) => i.id)));
    refreshBookmarkCount();
    if (selectedInnovation?.id === innovation.id) {
      setDrawerVisible(false);
      setSelectedInnovation(null);
    }
  };

  const openDrawer = (innovation) => {
    setSelectedInnovation(innovation);
    setDrawerVisible(true);
  };

  const handleDownload = useCallback(async (innovation) => {
    if (!innovation) return;
    const result = await downloadInnovationToFile(innovation);
    if (!result.success) {
      Alert.alert('Download failed', result.error || 'Could not save file.');
    }
  }, []);

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
      <View style={styles.cardWrap}>
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
          isBookmarked={true}
          onBookmark={() => removeBookmark(item)}
          onDownload={handleDownload}
          showTopIcons
          thumbsUpCount={item.thumbsUpCount ?? 0}
          onThumbsUp={handleThumbsUp}
          onComments={setCommentsInnovation}
        />
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => openDrawer(item)}>
            <Ionicons name="eye-outline" size={20} color="#333" />
            <Text style={styles.cardActionText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cardActionBtn, isSelectedForCompare && styles.cardActionBtnSelected]}
            onPress={() => toggleCompare(item.id)}
            disabled={!isSelectedForCompare && selectedForCompare.length >= 2}
          >
            <Ionicons name={isSelectedForCompare ? 'scale' : 'scale-outline'} size={20} color={isSelectedForCompare ? '#030213' : '#666'} />
            <Text style={[styles.cardActionText, isSelectedForCompare && styles.cardActionTextSelected]}>Compare</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => removeBookmark(item)}>
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
            <Text style={[styles.cardActionText, { color: '#dc2626' }]}>Remove</Text>
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
            <Ionicons name="scale-outline" size={18} color={canCompare ? '#fff' : '#999'} />
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
          <Text style={styles.emptyText}>Bookmark innovations from Home to see them here.</Text>
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
      />

      <Modal visible={showComparison} transparent animationType="slide" onRequestClose={closeComparison} statusBarTranslucent>
        <View style={styles.comparisonOverlay}>
          <View style={[styles.comparisonDrawer, { height: SCREEN_HEIGHT - insets.top }]}>
            <TouchableOpacity onPress={closeComparison} style={styles.comparisonHandleWrap}>
              <View style={styles.comparisonHandle} />
            </TouchableOpacity>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonTitle}>Innovation Comparison</Text>
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

function ComparisonView({ item1, item2 }) {
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
        <Text style={styles.compareTitleA} numberOfLines={2}>{item1.title}</Text>
        <Text style={styles.compareTitleB} numberOfLines={2}>{item2.title}</Text>
      </View>

      <ComparisonSection title="Summary" icon="document-text-outline">
        <ComparisonRow label="Description" a={truncate(item1.shortDescription || item1.longDescription, 80)} b={truncate(item2.shortDescription || item2.longDescription, 80)} />
        <ComparisonRow label="Cost" a={costLabel(item1.cost)} b={costLabel(item2.cost)} />
        <ComparisonRow label="Complexity" a={cap(item1.complexity)} b={cap(item2.complexity)} />
        <ComparisonRow label="Grassroots" a={item1.isGrassroots ? 'Yes' : 'No'} b={item2.isGrassroots ? 'Yes' : 'No'} />
      </ComparisonSection>

      <ComparisonSection title="Readiness & adoption" icon="trending-up-outline">
        <View style={styles.compareBarRow}>
          <Text style={styles.compareBarLabel}>Readiness</Text>
          <View style={styles.compareBarPair}>
            <View style={styles.compareBarCell}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFill, { width: `${pct(item1.readinessLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{readiness1.name}</Text>
            </View>
            <View style={styles.compareBarCell}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFill, { width: `${pct(item2.readinessLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{readiness2.name}</Text>
            </View>
          </View>
        </View>
        <View style={styles.compareBarRow}>
          <Text style={styles.compareBarLabel}>Adoption</Text>
          <View style={styles.compareBarPair}>
            <View style={styles.compareBarCell}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFillBlue, { width: `${pct(item1.adoptionLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{adoption1.name}</Text>
            </View>
            <View style={styles.compareBarCell}>
              <View style={styles.compareBarBg}><View style={[styles.compareBarFillBlue, { width: `${pct(item2.adoptionLevel)}%` }]} /></View>
              <Text style={styles.compareBarVal} numberOfLines={1}>{adoption2.name}</Text>
            </View>
          </View>
        </View>
      </ComparisonSection>

      <ComparisonSection title="Location" icon="location-outline">
        <ComparisonRow label="Where" a={loc(item1)} b={loc(item2)} />
      </ComparisonSection>

      {(item1.types?.length || item2.types?.length) > 0 && (
        <ComparisonSection title="Type & focus" icon="pricetag-outline">
          <ComparisonRow label="Types" a={list(item1.types, 4)} b={list(item2.types, 4)} />
        </ComparisonSection>
      )}

      {(item1.useCases?.length || item2.useCases?.length) > 0 && (
        <ComparisonSection title="Use cases" icon="briefcase-outline">
          <ComparisonRow label="Primary" a={list(item1.useCases)} b={list(item2.useCases)} />
        </ComparisonSection>
      )}

      {(item1.users?.length || item2.users?.length) > 0 && (
        <ComparisonSection title="User groups" icon="people-outline">
          <ComparisonRow label="Intended for" a={list(item1.users)} b={list(item2.users)} />
        </ComparisonSection>
      )}

      {((item1.sdgs?.length || item2.sdgs?.length) > 0) && (
        <ComparisonSection title="SDG alignment" icon="ribbon-outline">
          <View style={styles.compareSdgRow}>
            <View style={styles.compareSdgCol}>
              {sdgBadges(item1.sdgs).map(({ num, color }) => (
                <View key={`1-${num}`} style={[styles.compareSdgBadge, { backgroundColor: color }]}>
                  <Text style={styles.compareSdgNum}>{num}</Text>
                </View>
              ))}
              {(!item1.sdgs?.length) && <Text style={styles.compareMuted}>—</Text>}
            </View>
            <View style={styles.compareSdgCol}>
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
        <ComparisonRow label="Source" a={item1.dataSource || '—'} b={item2.dataSource || '—'} />
        <ComparisonRow label="Owner / partner" a={item1.owner || item1.partner || '—'} b={item2.owner || item2.partner || '—'} />
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

function ComparisonRow({ label, a, b }) {
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareRowLabel}>{label}</Text>
      <View style={styles.compareRowCells}>
        <Text style={styles.compareCellA} numberOfLines={2}>{a || '—'}</Text>
        <Text style={styles.compareCellB} numberOfLines={2}>{b || '—'}</Text>
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
  list: { padding: 20, paddingBottom: 100 },
  cardWrap: { marginBottom: 16 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 8, paddingVertical: 8, paddingHorizontal: 4 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionBtnSelected: {},
  cardActionText: { fontSize: 13, color: '#666' },
  cardActionTextSelected: { color: '#030213', fontWeight: '600' },
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
  compareTitles: { flexDirection: 'row', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  compareTitleA: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  compareTitleB: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  compareSection: { marginBottom: 20 },
  compareSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  compareSectionTitle: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5 },
  compareSectionBody: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  compareRow: { marginBottom: 10 },
  compareRowLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  compareRowCells: { flexDirection: 'row', gap: 12 },
  compareCellA: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 18 },
  compareCellB: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 18 },
  compareBarRow: { marginBottom: 12 },
  compareBarLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  compareBarPair: { flexDirection: 'row', gap: 12 },
  compareBarCell: { flex: 1 },
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
