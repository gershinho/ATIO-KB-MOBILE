import React from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import Icon from './icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import { COLORS } from '../theme/fao';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

/**
 * The shape shared by the Bookmarks and Downloads tabs: a title bar with an
 * optional accessory, a spinner while loading, an icon-and-two-lines empty
 * state, and a list of titled rows with icon buttons on the right.
 *
 * The two screens carried five separate copies of this between them — the
 * container, the header row, the empty state, the row markup and the styles for
 * all of it — and they had already drifted: one screen's empty-state icon
 * wrapper still carried a `fontSize` left over from when the icon was an emoji.
 *
 * @param {string} title
 * @param {React.ReactNode} [headerAccessory] - rendered opposite the title
 * @param {boolean} loading
 * @param {Array} items
 * @param {(item: object) => React.ReactNode} renderActions - the row's buttons
 * @param {{icon: string, title: string, text: string}} empty
 * @param {React.ReactNode} [children] - overlays (drawers, modals) for the screen
 */
export default function SavedList({
  title, headerAccessory, loading, items, renderActions, empty, children,
}) {
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.textHeading} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <AppText style={styles.header}>{title}</AppText>
        {headerAccessory}
      </View>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name={empty.icon} size={48} color={COLORS.textMuted} />
          </View>
          <AppText style={styles.emptyTitle}>{empty.title}</AppText>
          <AppText style={styles.emptyText}>{empty.text}</AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <AppText style={styles.rowTitle} numberOfLines={2}>{item.title}</AppText>
              <View style={styles.rowActions}>{renderActions(item)}</View>
            </View>
          )}
        />
      )}
      {children}
    </View>
  );
}

/**
 * A round icon button sized for a saved-list row, with the generous hit target
 * both screens were already using.
 */
export function RowIconButton({ icon, color, onPress, label, disabled, selected }) {
  return (
    <TouchableOpacity
      style={[styles.rowIconBtn, selected && styles.rowIconBtnSelected]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
    >
      <Icon name={icon} size={22} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  header: { fontSize: 22, fontWeight: '700', color: COLORS.textHeading },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceMuted },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textHeading, marginRight: 12, lineHeight: 20 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowIconBtnSelected: { backgroundColor: COLORS.surfaceMuted },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textBody, textAlign: 'center' },
});
