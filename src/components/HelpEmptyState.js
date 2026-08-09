import React from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AtiobotMagnifyingGlass from '../../assets/Atiobot-magnifying-glass.svg';
import AppText from './AppText';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

/**
 * The "nothing matched — here are hotlines that might" state.
 *
 * HomeScreen carried this same 57-line block inline in both of its list
 * branches, differing only in two strings. The copies had already drifted apart
 * in their hit targets. Callers now supply the wording; everything else is
 * decided here. Its text scales with the text-size setting, which neither
 * inline copy did — that now comes from AppText rather than from remembering.
 *
 * @param {string} title
 * @param {string} subtitle
 * @param {boolean} loading - help lookup still in flight
 * @param {Array<{id: string|number, title: string}>} items
 * @param {(id: string|number) => boolean} isBookmarked
 * @param {(item: object) => void} onExpand - open the detail drawer, expanded
 * @param {(item: object) => void} onToggleBookmark
 */
export default function HelpEmptyState({
  title,
  subtitle,
  loading,
  items,
  isBookmarked,
  onExpand,
  onToggleBookmark,
}) {
  return (
    <View style={styles.emptyStateWrap}>
      <View style={styles.emptyStateMessageWrap}>
        <AtiobotMagnifyingGlass width={120} height={77} style={styles.emptyStateIcon} />
        <AppText style={styles.emptyStateTitle}>{title}</AppText>
        <AppText style={styles.emptyStateSubtitle}>{subtitle}</AppText>
      </View>
      <View style={styles.seekFurtherHeader}>
        <AppText style={styles.seekFurtherTitle}>Seek further help</AppText>
        <View style={styles.seekFurtherScrollHint}>
          <Ionicons name="chevron-down" size={14} color="#6b7280" />
          <AppText style={styles.seekFurtherScrollHintText}>
            Scroll for more
          </AppText>
        </View>
      </View>
      {loading ? (
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
          {items.map((item) => {
            const bookmarked = isBookmarked(item.id);
            return (
              <View key={item.id} style={styles.helpCard}>
                <AppText
                  style={styles.helpCardTitle}
                  numberOfLines={2}
                >
                  {item.title}
                </AppText>
                <View style={styles.helpCardActions}>
                  <TouchableOpacity
                    style={styles.helpCardExpandBtn}
                    onPress={() => onExpand(item)}
                    activeOpacity={0.7}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.title}`}
                  >
                    <Ionicons name="expand-outline" size={22} color="#333" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.helpCardBookmarkBtn, bookmarked && styles.helpCardBookmarkBtnActive]}
                    onPress={() => onToggleBookmark(item)}
                    activeOpacity={0.7}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={bookmarked ? `Remove bookmark on ${item.title}` : `Bookmark ${item.title}`}
                  >
                    <Ionicons
                      name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={18}
                      color={bookmarked ? '#fff' : '#333'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  helpCardTitle: { fontSize: 13, flex: 1, fontWeight: '600', color: '#111', marginRight: 8 },
  helpCardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpCardExpandBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  helpCardBookmarkBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  helpCardBookmarkBtnActive: { backgroundColor: '#2563eb' },
});
