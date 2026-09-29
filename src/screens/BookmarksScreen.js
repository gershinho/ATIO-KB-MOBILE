import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Modal, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import Icon from '../components/icons/Icon';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readBookmarks } from '../storage/localState';
import { AccessibilityContext } from '../context/AccessibilityContext';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';
import SavedList, { RowIconButton } from '../components/SavedList';
import ComparisonView from '../components/comparison/ComparisonView';
import useInnovationInteractions from '../hooks/useInnovationInteractions';
import AppText from '../components/AppText';
import { COLORS } from '../theme/fao';

const MAX_COMPARE = 2;

export default function BookmarksScreen() {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useContext(AccessibilityContext);
  const { height: screenHeight } = useWindowDimensions();

  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  // Liking, the detail drawer and comments behave identically on every screen
  // that lists innovations. This screen used to carry its own version, which
  // incremented the thumbs-up count on every tap — no toggle, no record of
  // having already liked — breaking the one-like-per-device invariant the
  // database layer documents and the other screens honour.
  const interactions = useInnovationInteractions();

  const loadBookmarks = useCallback(async () => {
    setBookmarks(await readBookmarks());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadBookmarks();
    }, [loadBookmarks])
  );

  // Drop compare selections whose bookmark has gone away.
  useEffect(() => {
    setSelectedForCompare((prev) => prev.filter((id) => bookmarks.some((i) => i.id === id)));
  }, [bookmarks]);

  const { toggleBookmark, closeDrawer, selectedInnovation } = interactions;
  const removeBookmark = useCallback(
    async (innovation) => {
      await toggleBookmark(innovation);
      await loadBookmarks();
      if (selectedInnovation?.id === innovation.id) closeDrawer();
    },
    [toggleBookmark, loadBookmarks, closeDrawer, selectedInnovation]
  );

  const toggleCompare = (id) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const [innovationA, innovationB] =
    selectedForCompare.length === MAX_COMPARE
      ? selectedForCompare.map((id) => bookmarks.find((i) => i.id === id) || null)
      : [null, null];
  const canCompare = bookmarks.length >= MAX_COMPARE && selectedForCompare.length === MAX_COMPARE;

  return (
    <SavedList
      title="Bookmarks"
      loading={loading}
      items={bookmarks}
      headerAccessory={
        bookmarks.length >= MAX_COMPARE ? (
          <TouchableOpacity
            style={[styles.compareBtn, canCompare && styles.compareBtnActive]}
            onPress={() => setShowComparison(true)}
            disabled={!canCompare}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCompare }}
          >
            <Icon name="git-compare-outline" size={18} color={canCompare ? '#fff' : COLORS.textMuted} />
            <AppText style={[styles.compareBtnText, canCompare && styles.compareBtnTextActive]}>
              Compare ({selectedForCompare.length}/{MAX_COMPARE})
            </AppText>
          </TouchableOpacity>
        ) : null
      }
      empty={{
        icon: 'bookmark-outline',
        title: 'No bookmarks yet',
        text: 'Bookmark solutions from Home to see them here.',
      }}
      renderActions={(item) => {
        const selected = selectedForCompare.includes(item.id);
        return (
          <>
            <RowIconButton
              icon="expand-outline"
              color={COLORS.textBody}
              onPress={() => interactions.openDrawer(item, true)}
              label={`Open ${item.title}`}
            />
            <RowIconButton
              icon={selected ? 'git-compare' : 'git-compare-outline'}
              color={selected ? COLORS.textHeading : COLORS.textBody}
              onPress={() => toggleCompare(item.id)}
              disabled={!selected && selectedForCompare.length >= MAX_COMPARE}
              selected={selected}
              label={
                selected
                  ? `Remove ${item.title} from comparison`
                  : `Add ${item.title} to comparison`
              }
            />
            <RowIconButton
              icon="trash-outline"
              color={COLORS.danger}
              onPress={() => removeBookmark(item)}
              label={`Remove bookmark on ${item.title}`}
            />
          </>
        );
      }}
    >
      <DetailDrawer
        innovation={selectedInnovation}
        visible={interactions.drawerVisible}
        onClose={closeDrawer}
        startExpanded
        isBookmarked={interactions.isBookmarked}
        onBookmark={removeBookmark}
        onDownload={interactions.addDownload}
        onComments={interactions.openComments}
        onThumbsUp={interactions.handleThumbsUp}
        isLiked={interactions.isLiked}
      />

      <Modal
        visible={showComparison}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setShowComparison(false)}
        statusBarTranslucent
      >
        <View style={styles.comparisonOverlay}>
          <View style={[styles.comparisonDrawer, { height: screenHeight - insets.top }]}>
            <TouchableOpacity
              onPress={() => setShowComparison(false)}
              style={styles.comparisonHandleWrap}
              accessibilityRole="button"
              accessibilityLabel="Close comparison"
            >
              <View style={styles.comparisonHandle} />
            </TouchableOpacity>
            <View style={styles.comparisonHeader}>
              <AppText style={styles.comparisonTitle}>Solution Comparison</AppText>
              <TouchableOpacity
                onPress={() => setShowComparison(false)}
                style={styles.comparisonClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={24} color={COLORS.textBody} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.comparisonScroll}
              contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
              showsVerticalScrollIndicator
            >
              {innovationA && innovationB && <ComparisonView innovationA={innovationA} innovationB={innovationB} />}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CommentsModal
        visible={!!interactions.commentsInnovation}
        innovation={interactions.commentsInnovation}
        onClose={interactions.closeComments}
        onCommentAdded={interactions.handleCommentAdded}
      />
    </SavedList>
  );
}

const styles = StyleSheet.create({
  compareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.surfaceMuted },
  compareBtnActive: { backgroundColor: COLORS.primary },
  compareBtnText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  compareBtnTextActive: { color: COLORS.textInverse },
  comparisonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  comparisonDrawer: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  comparisonHandleWrap: { paddingVertical: 12, alignItems: 'center' },
  comparisonHandle: { width: 48, height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  comparisonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  comparisonTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textHeading },
  comparisonClose: { padding: 4 },
  comparisonScroll: { flex: 1 },
});
