import React, { useContext, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityContext } from '../../context/AccessibilityContext';
import BouncingLoader from '../../components/BouncingLoader';
import HelpEmptyState from '../../components/HelpEmptyState';
import ResultsList from '../../components/ResultsList';
import InnovationCard from '../../components/InnovationCard';
import AtioIcon from '../../../assets/ATIO ICON1.svg';

/**
 * The Search half of Home: the landing hero before a search, and the results
 * list after one.
 *
 * Presentational. The search session itself — query, results, paging,
 * dictation — is owned by the shell so it survives a trip through Explore and
 * back, and is handed in whole as `search`.
 */
export default function SearchMode({
  search,
  interactions,
  help,
  searchBarExpanded,
  onExpandSearch,
  onCollapseSearch,
  onOpenOpportunityHeatmap,
  onOpenReadyHeatmap,
}) {
  const { reduceMotion, getScaledSize } = useContext(AccessibilityContext);
  const heroScrollRef = useRef(null);
  const heroContentHeight = useRef(0);
  const heroScrollViewHeight = useRef(0);
  const expandedInputRef = useRef(null);

  // Keep the submit button above the keyboard on the hero. The keyboard height
  // itself was previously stored in state that nothing ever read.
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => {
          const scrollView = heroScrollRef.current;
          const contentHeight = heroContentHeight.current;
          const viewportHeight = heroScrollViewHeight.current;
          if (scrollView && contentHeight > 0 && viewportHeight > 0) {
            scrollView.scrollTo({ y: Math.max(0, contentHeight - viewportHeight), animated: true });
          } else {
            scrollView?.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    );
    return () => show.remove();
  }, []);

  useEffect(() => {
    if (!searchBarExpanded) return;
    const timer = setTimeout(() => expandedInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [searchBarExpanded]);

  const renderCard = (item) => {
    const innovation = interactions.withCounts(item);
    return (
      <InnovationCard
        innovation={innovation}
        onLearnMore={() => interactions.openDrawer(innovation)}
        isBookmarked={interactions.isBookmarked(innovation.id)}
        onBookmark={interactions.toggleBookmark}
        onDownload={interactions.addDownload}
        onThumbsUp={interactions.handleThumbsUp}
        onComments={interactions.openComments}
        isLiked={interactions.isLiked(innovation.id)}
      />
    );
  };

  const submit = (overrideQuery) => search.run(overrideQuery, true);

  if (!search.hasSearched) {
    return (
      <ScrollView
        ref={heroScrollRef}
        style={styles.heroScroll}
        contentContainerStyle={styles.heroScrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_, contentHeight) => { heroContentHeight.current = contentHeight; }}
        onLayout={(e) => { heroScrollViewHeight.current = e.nativeEvent.layout.height; }}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroTopHalf}>
            <View style={styles.logoRow}>
              <View style={styles.logoIcon}>
                <AtioIcon width={20} height={20} />
              </View>
              <Text style={[styles.logoText, { fontSize: getScaledSize(18) }]}>ATIO KB Solutions</Text>
            </View>
            <Text style={[styles.heroTitle, { fontSize: getScaledSize(18) }]}>
              Explore solutions we're growing together
            </Text>
            <Text style={[styles.heroSubtitle, { fontSize: getScaledSize(12) }]}>Powered by AI</Text>
            <View style={styles.searchInputWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search solutions, challenges, or ideas..."
                placeholderTextColor="#999"
                multiline
                scrollEnabled
                value={search.query}
                onChangeText={search.updateQuery}
                accessibilityLabel="Search solutions"
              />
              <MicButton
                isRecording={search.isRecording}
                isTranscribing={search.isTranscribing}
                onPress={search.toggleSpeech}
                style={styles.micBtn}
                size={20}
                idleColor="#666"
              />
            </View>
          </View>
          <View style={styles.heroBottomHalf} collapsable={false}>
            <Pressable
              style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
              onPress={() => submit()}
              delayLongPress={500}
              accessibilityRole="button"
            >
              <Text style={[styles.searchBtnText, { fontSize: getScaledSize(13) }]}>Search Solutions</Text>
            </Pressable>
          </View>
        </View>
        <TouchableOpacity
          style={styles.heatmapBtn}
          onPress={onOpenOpportunityHeatmap}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="grid-outline" size={16} color="#f97316" />
          <Text style={[styles.heatmapBtnText, { fontSize: getScaledSize(12) }]}>Adoption Opportunities</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.readyBtn}
          onPress={onOpenReadyHeatmap}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={16} color="#6d28d9" style={styles.readyBtnIcon} />
          <Text style={[styles.readyBtnText, { fontSize: getScaledSize(13) }]}>Ready to Use</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.searchContentWrap}>
      <View style={[styles.searchBarRow, searchBarExpanded && styles.searchBarRowExpanded]}>
        {searchBarExpanded ? (
          <View style={styles.searchExpandedCard}>
            <Text style={[styles.searchExpandedLabel, { fontSize: getScaledSize(14) }]}>
              Refine your search
            </Text>
            <TextInput
              ref={expandedInputRef}
              style={[styles.searchExpandedInput, { fontSize: getScaledSize(16) }]}
              value={search.query}
              onChangeText={search.updateQuery}
              placeholder="What would you like to explore? Solutions, challenges, or ideas..."
              placeholderTextColor="#999"
              multiline
              onBlur={onCollapseSearch}
              onSubmitEditing={() => submit()}
              accessibilityLabel="Refine your search"
            />
            <View style={styles.searchExpandedActions}>
              <MicButton
                isRecording={search.isRecording}
                isTranscribing={search.isTranscribing}
                onPress={search.toggleSpeech}
                style={styles.searchExpandedMicBtn}
                size={22}
                idleColor="#374151"
              />
              <TouchableOpacity
                style={styles.searchExpandedPrimaryBtn}
                onPress={() => submit()}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Ionicons name="search" size={18} color="#fff" style={styles.searchExpandedPrimaryIcon} />
                <Text style={[styles.searchExpandedPrimaryLabel, { fontSize: getScaledSize(15) }]}>
                  Search Solutions
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.searchBarInput}
              value={search.query}
              onChangeText={search.updateQuery}
              placeholder="Search..."
              placeholderTextColor="#999"
              onFocus={onExpandSearch}
              onSubmitEditing={() => submit()}
              accessibilityLabel="Search solutions"
            />
            <TouchableOpacity
              style={styles.searchBarBtn}
              onPress={() => submit()}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="search-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={styles.searchContentArea}>
        {search.loading ? (
          <View style={styles.loadingWrap}>
            <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
            <Text style={[styles.aiLoadingText, { fontSize: getScaledSize(13) }]}>
              AI is finding the best solutions...
            </Text>
          </View>
        ) : search.error ? (
          <View style={styles.searchErrorWrap}>
            <Ionicons name="warning-outline" size={32} color="#d97706" />
            <Text style={[styles.searchErrorText, { fontSize: getScaledSize(13) }]}>{search.error}</Text>
            <TouchableOpacity
              style={styles.searchRetryBtn}
              onPress={() => submit()}
              accessibilityRole="button"
            >
              <Text style={styles.searchRetryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.searchResultsWrap}>
            <View style={styles.poweredByRow}>
              <View style={styles.poweredByLine} />
              <View style={styles.poweredByLabelWrap}>
                <Text style={styles.poweredByResults}>Powered by AI</Text>
              </View>
              <View style={styles.poweredByLine} />
            </View>
            <ResultsList
              data={search.results}
              renderCard={renderCard}
              loadingMore={search.hasMore}
              onEndReached={search.loadMore}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              emptyState={
                <HelpEmptyState
                  title="No solutions found for your search"
                  subtitle="We couldn't find any solutions matching your query. Below are hotlines and helplines that may help."
                  loading={help.loading}
                  items={help.items}
                  isBookmarked={interactions.isBookmarked}
                  onExpand={(item) => interactions.openDrawer(item, true)}
                  onToggleBookmark={interactions.toggleBookmark}
                />
              }
            />
          </View>
        )}
        {searchBarExpanded && (
          <TouchableWithoutFeedback onPress={onCollapseSearch}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        )}
      </View>
    </View>
  );
}

/**
 * The dictation button, which appears on both the hero and the expanded search
 * bar with different sizing but identical behaviour.
 */
function MicButton({ isRecording, isTranscribing, onPress, style, size, idleColor }) {
  return (
    <TouchableOpacity
      style={[style, (isRecording || isTranscribing) && styles.micBtnActive]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isTranscribing}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? 'Stop dictation' : 'Dictate your search'}
      accessibilityState={{ disabled: isTranscribing, busy: isTranscribing }}
    >
      {isTranscribing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons
          name={isRecording ? 'mic' : 'mic-outline'}
          size={size}
          color={isRecording ? '#fff' : idleColor}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  heroScroll: { flex: 1 },
  heroScrollContent: { flexGrow: 1, justifyContent: 'flex-start' },
  heroSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  heroTopHalf: { alignItems: 'center' },
  heroBottomHalf: { alignItems: 'center', paddingTop: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  logoIcon: { width: 32, height: 32, backgroundColor: '#22c55e', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  heroTitle: { fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { color: '#999', textAlign: 'center', marginBottom: 20 },
  searchInputWrap: { position: 'relative', marginBottom: 0, alignSelf: 'stretch' },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, paddingBottom: 44, fontSize: 13, minHeight: 148, height: 148, textAlignVertical: 'top' },
  micBtn: { position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: '#dc2626' },
  searchBtn: { backgroundColor: '#000', borderRadius: 12, padding: 14, alignItems: 'center', alignSelf: 'stretch' },
  searchBtnPressed: { opacity: 0.8 },
  searchBtnText: { color: '#fff', fontWeight: '600' },
  heatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  heatmapBtnText: { fontWeight: '600', color: '#f97316' },
  readyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  readyBtnIcon: { marginRight: 8 },
  readyBtnText: { fontWeight: '600', color: '#6d28d9' },
  poweredByRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: -8 },
  poweredByLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  poweredByLabelWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 4 },
  poweredByResults: { color: '#999', fontSize: 10 },
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
  searchBarBtn: { width: 44, height: 44, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchExpandedCard: { gap: 0 },
  searchExpandedLabel: { fontWeight: '600', color: '#6b7280', letterSpacing: 0.3, marginBottom: 10 },
  searchExpandedInput: {
    minHeight: 120,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  searchExpandedActions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
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
  searchExpandedPrimaryIcon: { marginRight: 6 },
  searchExpandedPrimaryLabel: { fontWeight: '600', color: '#fff' },
  searchContentWrap: { flex: 1, minHeight: 0 },
  searchContentArea: { flex: 1, minHeight: 0, position: 'relative' },
  searchResultsWrap: { flex: 1, minHeight: 0 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  aiLoadingText: { color: '#999', marginTop: 8 },
  searchErrorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  searchErrorText: { textAlign: 'center', color: '#666', lineHeight: 20 },
  searchRetryBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  searchRetryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
