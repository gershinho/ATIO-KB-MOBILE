import React, { useContext, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import Icon from '../../components/icons/Icon';
import { AccessibilityContext } from '../../context/AccessibilityContext';
import BouncingLoader from '../../components/BouncingLoader';
import HelpEmptyState from '../../components/HelpEmptyState';
import ResultsList from '../../components/ResultsList';
import InteractiveInnovationCard from '../../components/InteractiveInnovationCard';
import AtioIcon from '../../../assets/ATIO ICON1.svg';
import AppText from '../../components/AppText';
import { COLORS, RADIUS } from '../../theme/fao';

/**
 * @typedef {import('../../hooks/useInnovationInteractions').InnovationInteractions} InnovationInteractions
 */


/**
 * The Search half of Home: the landing hero before a search, and the results
 * list after one.
 *
 * Presentational. The search session itself — query, results, paging,
 * dictation — is owned by the shell so it survives a trip through Explore and
 * back, and is handed in whole as `search`.
 *
 * @param {object} search - the useAiSearch return value
 * @param {InnovationInteractions} interactions
 * @param {{items: Array, loading: boolean}} help - hotlines for the empty state
 * @param {boolean} searchBarExpanded
 * @param {() => void} onExpandSearch
 * @param {() => void} onCollapseSearch
 * @param {() => void} onOpenOpportunityHeatmap
 * @param {() => void} onOpenReadyHeatmap
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
  const { reduceMotion } = useContext(AccessibilityContext);
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

  const renderCard = (item) => (
    <InteractiveInnovationCard item={item} interactions={interactions} />
  );

  const submit = (overrideQuery) => search.run(overrideQuery);

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
              <AppText style={styles.logoText}>ATIO KB Solutions</AppText>
            </View>
            <AppText style={styles.heroSubtitle}>Powered by AI</AppText>
            <View style={styles.searchInputWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search solutions, challenges, or ideas..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                scrollEnabled
                value={search.query}
                onChangeText={search.updateQuery}
                accessibilityLabel="Search solutions"
              />
              {!search.speechUnavailable && (
                <MicButton
                  isRecording={search.isRecording}
                  isTranscribing={search.isTranscribing}
                  onPress={search.toggleSpeech}
                  style={styles.micBtn}
                  size={20}
                  idleColor={COLORS.textBody}
                />
              )}
            </View>
          </View>
          <View style={styles.heroBottomHalf} collapsable={false}>
            <Pressable
              style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
              onPress={() => submit()}
              delayLongPress={500}
              accessibilityRole="button"
            >
              <AppText style={styles.searchBtnText}>Search Solutions</AppText>
            </Pressable>
          </View>
        </View>
        <TouchableOpacity
          style={styles.heatmapBtn}
          onPress={onOpenOpportunityHeatmap}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Icon name="grid-outline" size={16} color={COLORS.accent} />
          <AppText style={styles.heatmapBtnText}>Adoption Opportunities</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.readyBtn}
          onPress={onOpenReadyHeatmap}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Icon name="sparkles-outline" size={16} color={COLORS.primaryDark} style={styles.readyBtnIcon} />
          <AppText style={styles.readyBtnText}>Ready to Use</AppText>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.searchContentWrap}>
      <View style={[styles.searchBarRow, searchBarExpanded && styles.searchBarRowExpanded]}>
        {searchBarExpanded ? (
          <View style={styles.searchExpandedCard}>
            <AppText style={styles.searchExpandedLabel}>
              Refine your search
            </AppText>
            <TextInput
              ref={expandedInputRef}
              style={styles.searchExpandedInput}
              value={search.query}
              onChangeText={search.updateQuery}
              placeholder="What would you like to explore? Solutions, challenges, or ideas..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              onBlur={onCollapseSearch}
              onSubmitEditing={() => submit()}
              accessibilityLabel="Refine your search"
            />
            <View style={styles.searchExpandedActions}>
              {!search.speechUnavailable && (
                <MicButton
                  isRecording={search.isRecording}
                  isTranscribing={search.isTranscribing}
                  onPress={search.toggleSpeech}
                  style={styles.searchExpandedMicBtn}
                  size={22}
                  idleColor={COLORS.textBody}
                />
              )}
              <TouchableOpacity
                style={styles.searchExpandedPrimaryBtn}
                onPress={() => submit()}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Icon name="search" size={18} color="#fff" style={styles.searchExpandedPrimaryIcon} />
                <AppText style={styles.searchExpandedPrimaryLabel}>
                  Search Solutions
                </AppText>
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
              placeholderTextColor={COLORS.textMuted}
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
              <Icon name="search-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={styles.searchContentArea}>
        {search.loading ? (
          <View style={styles.loadingWrap}>
            <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
            <AppText style={styles.aiLoadingText}>
              AI is finding the best solutions...
            </AppText>
          </View>
        ) : search.error ? (
          <View style={styles.searchErrorWrap}>
            <Icon name="warning-outline" size={32} color={COLORS.accent} />
            <AppText style={styles.searchErrorText}>{search.error}</AppText>
            <TouchableOpacity
              style={styles.searchRetryBtn}
              onPress={() => submit()}
              accessibilityRole="button"
            >
              <AppText style={styles.searchRetryBtnText}>Retry</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.searchResultsWrap}>
            <View style={styles.poweredByRow}>
              <View style={styles.poweredByLine} />
              <View style={styles.poweredByLabelWrap}>
                <AppText style={styles.poweredByResults}>Powered by AI</AppText>
              </View>
              <View style={styles.poweredByLine} />
            </View>
            <ResultsList
              data={search.results}
              renderCard={renderCard}
              loadingMore={search.loadingMore}
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
        <Icon
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
  heroScrollContent: { flexGrow: 1, justifyContent: 'center' },
  heroSection: { paddingHorizontal: 20, paddingVertical: 24 },
  heroTopHalf: { alignItems: 'center' },
  heroBottomHalf: { alignItems: 'center', paddingTop: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  logoIcon: { width: 32, height: 32, backgroundColor: COLORS.primary, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontWeight: '800', color: COLORS.textHeading, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 28 },
  searchInputWrap: { position: 'relative', marginBottom: 0, alignSelf: 'stretch' },
  searchInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: 16, paddingBottom: 48, fontSize: 16, lineHeight: 22, minHeight: 148, height: 148, textAlignVertical: 'top' },
  micBtn: { position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: COLORS.danger },
  searchBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', alignSelf: 'stretch' },
  searchBtnPressed: { opacity: 0.8 },
  searchBtnText: { fontSize: 17, color: COLORS.textInverse, fontWeight: '600' },
  heatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: COLORS.accentTint,
    borderWidth: 1,
    borderColor: COLORS.accentTint,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  heatmapBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  readyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  readyBtnIcon: { marginRight: 8 },
  readyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primaryDark },
  poweredByRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: -8 },
  poweredByLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  poweredByLabelWrap: { backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 4 },
  poweredByResults: { color: COLORS.textMuted, fontSize: 10 },
  searchBarRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  searchBarBtn: { width: 44, height: 44, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  searchExpandedCard: { gap: 0 },
  searchExpandedLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, letterSpacing: 0.3, marginBottom: 10 },
  searchExpandedInput: { fontSize: 16,
    minHeight: 120,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  searchExpandedActions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  searchExpandedMicBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchExpandedPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  searchExpandedPrimaryIcon: { marginRight: 6 },
  searchExpandedPrimaryLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textInverse },
  searchContentWrap: { flex: 1, minHeight: 0 },
  searchContentArea: { flex: 1, minHeight: 0, position: 'relative' },
  searchResultsWrap: { flex: 1, minHeight: 0 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  aiLoadingText: { fontSize: 13, color: COLORS.textMuted, marginTop: 8 },
  searchErrorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  searchErrorText: { fontSize: 13, textAlign: 'center', color: COLORS.textBody, lineHeight: 20 },
  searchRetryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  searchRetryBtnText: { color: COLORS.textInverse, fontWeight: '600', fontSize: 13 },
});
