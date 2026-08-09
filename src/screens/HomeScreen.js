import React, { useCallback, useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase, getOpportunityHeatmapData, getReadyToUseHeatmapData } from '../database/db';
import { AccessibilityContext } from '../context/AccessibilityContext';
import ModePills from '../components/ModePills';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';
import OpportunityHeatmap from '../components/OpportunityHeatmap';
import ReadyToUseHeatmap from '../components/ReadyToUseHeatmap';
import useInnovationInteractions from '../hooks/useInnovationInteractions';
import useAiSearch from '../hooks/useAiSearch';
import useDrilldown from '../hooks/useDrilldown';
import useHelpInnovations from '../hooks/useHelpInnovations';
import SearchMode from './home/SearchMode';
import ExploreMode from './home/ExploreMode';
import DrilldownView from './home/DrilldownView';
import { opportunityCellTarget, readyCellTarget } from './home/drilldownTargets';

/**
 * Home hosts two capabilities behind a mode switch: Search and Explore.
 *
 * This file used to *be* both of them — 1,730 lines and 45 useState hooks, with
 * four render branches that each re-declared the same chrome. It is now a
 * shell: it owns what genuinely spans the two halves and nothing else.
 *
 * What lives here and why:
 *
 * - `mode` — the switch itself.
 * - `search` — held here rather than inside SearchMode so a trip through
 *   Explore and back does not discard the user's results.
 * - `drilldown` — opened from both halves. The two heat maps live on the Search
 *   side but open a drilldown on the Explore side, which is the reason this
 *   cannot sit in ExploreMode.
 * - `interactions` — bookmarking, liking, downloading and the detail drawer are
 *   reachable from every list on both halves.
 *
 * Explore's own data is not here: ExploreMode owns it, because it re-fetches on
 * every entry anyway.
 */
export default function HomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useContext(AccessibilityContext);

  const [mode, setMode] = useState('search'); // 'search' | 'explore'
  const [searchBarExpanded, setSearchBarExpanded] = useState(false);
  const [opportunityHeatmapVisible, setOpportunityHeatmapVisible] = useState(false);
  const [opportunityHeatmapData, setOpportunityHeatmapData] = useState(null);
  const [readyHeatmapVisible, setReadyHeatmapVisible] = useState(false);
  const [readyHeatmapData, setReadyHeatmapData] = useState(null);

  const interactions = useInnovationInteractions();
  const drilldown = useDrilldown();

  const animate = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [reduceMotion]);

  const collapseSearchBar = useCallback(() => {
    animate();
    setSearchBarExpanded(false);
  }, [animate]);

  const expandSearchBar = useCallback(() => {
    animate();
    setSearchBarExpanded(true);
  }, [animate]);

  // Submitting a search always leaves the refine card, whichever control fired it.
  const onRunStart = useCallback(() => {
    Keyboard.dismiss();
    collapseSearchBar();
  }, [collapseSearchBar]);

  const search = useAiSearch({ onRunStart });

  // The help section is fetched only once something is actually asking for it.
  const showHelpEmptyState =
    (search.hasSearched && !search.loading && search.results.length === 0) ||
    (drilldown.visible && !drilldown.loading && drilldown.results.length === 0);
  const help = useHelpInnovations(showHelpEmptyState);

  // Warm up SQLite in the background so Explore loads faster later.
  useEffect(() => {
    initDatabase().catch((e) => {
      console.log('[home] initDatabase warmup failed:', e);
    });
  }, []);

  const { reloadBookmarks } = interactions;
  useFocusEffect(
    useCallback(() => {
      reloadBookmarks();
    }, [reloadBookmarks])
  );

  // Tapping the Home tab while already on Home returns to the starting state.
  const { reset: resetSearch } = search;
  const { close: closeDrilldown } = drilldown;
  const { closeDrawer } = interactions;
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (!isFocused) return;
      resetSearch();
      setMode('search');
      closeDrilldown();
      closeDrawer();
    });
    return unsubscribe;
  }, [navigation, isFocused, resetSearch, closeDrilldown, closeDrawer]);

  // —— heat maps ————————————————————————————————————————————————
  //
  // No caching here: db.js memoizes both data sets at module level, so the
  // session-length refs this screen used to keep were a second cache layer over
  // the same values.

  const openOpportunityHeatmap = useCallback(async () => {
    setOpportunityHeatmapVisible(true);
    try {
      setOpportunityHeatmapData(await getOpportunityHeatmapData());
    } catch (e) {
      console.warn('[home] Opportunity heat map load failed:', e);
    }
  }, []);

  const openReadyHeatmap = useCallback(async () => {
    setReadyHeatmapVisible(true);
    try {
      setReadyHeatmapData(await getReadyToUseHeatmapData());
    } catch (e) {
      console.warn('[home] Ready to Use heat map load failed:', e);
    }
  }, []);

  /** A heat map cell opens a drilldown, which lives on the Explore side. */
  const openDrilldownFromHeatmap = useCallback(
    (target) => {
      setOpportunityHeatmapVisible(false);
      setReadyHeatmapVisible(false);
      setMode('explore');
      return drilldown.open(target);
    },
    [drilldown]
  );

  const onSelectMode = useCallback(
    (nextMode) => {
      setMode(nextMode);
      // Switching modes leaves any open drilldown behind; re-picking Explore
      // while inside one steps back out to the Explore landing page.
      closeDrilldown();
    },
    [closeDrilldown]
  );

  const renderMode = () => {
    if (mode === 'explore') {
      return drilldown.visible ? (
        <DrilldownView
          drilldown={drilldown}
          interactions={interactions}
          help={help}
          onBack={closeDrilldown}
        />
      ) : (
        <ExploreMode interactions={interactions} onOpenDrilldown={drilldown.open} />
      );
    }
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <SearchMode
          search={search}
          interactions={interactions}
          help={help}
          searchBarExpanded={searchBarExpanded}
          onExpandSearch={expandSearchBar}
          onCollapseSearch={collapseSearchBar}
          onOpenOpportunityHeatmap={openOpportunityHeatmap}
          onOpenReadyHeatmap={openReadyHeatmap}
        />
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ModePills mode={mode} onSelect={onSelectMode} />
      {renderMode()}

      <DetailDrawer
        innovation={interactions.selectedInnovation}
        visible={interactions.drawerVisible}
        onClose={interactions.closeDrawer}
        startExpanded={interactions.drawerStartExpanded}
        isBookmarked={
          interactions.selectedInnovation
            ? interactions.isBookmarked(interactions.selectedInnovation.id)
            : false
        }
        onBookmark={
          interactions.selectedInnovation
            ? () => interactions.toggleBookmark(interactions.selectedInnovation)
            : undefined
        }
        onDownload={
          interactions.selectedInnovation
            ? () => interactions.addDownload(interactions.selectedInnovation)
            : undefined
        }
        thumbsUpCount={interactions.selectedInnovation?.thumbsUpCount ?? 0}
        onThumbsUp={interactions.handleThumbsUp}
        isLiked={
          interactions.selectedInnovation
            ? interactions.isLiked(interactions.selectedInnovation.id)
            : false
        }
        commentCount={interactions.selectedInnovation?.commentCount ?? 0}
        onComments={interactions.openComments}
      />

      <CommentsModal
        visible={!!interactions.commentsInnovation}
        innovation={interactions.commentsInnovation}
        onClose={interactions.closeComments}
        onCommentAdded={interactions.handleCommentAdded}
      />

      <OpportunityHeatmap
        visible={opportunityHeatmapVisible}
        onClose={() => setOpportunityHeatmapVisible(false)}
        data={opportunityHeatmapData}
        onCellPress={(regionHubName, challengeId) =>
          openDrilldownFromHeatmap(opportunityCellTarget(regionHubName, challengeId))
        }
      />

      <ReadyToUseHeatmap
        visible={readyHeatmapVisible}
        onClose={() => setReadyHeatmapVisible(false)}
        data={readyHeatmapData}
        onCellPress={(challengeId, typeId) =>
          openDrilldownFromHeatmap(readyCellTarget(challengeId, typeId))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
});
