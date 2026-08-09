import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import AppText from './AppText';

/**
 * The paged list of innovation cards, shared by search results and drilldown.
 *
 * Both call sites had their own copy of the same FlatList: same key extractor,
 * same "loading more" footer, same end-reached threshold, and the same
 * flex-grow trick that lets an empty state fill the viewport. Only the padding
 * and the footer's trigger condition actually differed, so those are props.
 *
 * @param {Array} data
 * @param {(item: object) => React.ReactNode} renderCard
 * @param {React.ReactNode} emptyState - rendered in place of the rows when data is empty
 * @param {boolean} loadingMore - show the footer spinner
 * @param {() => void} onEndReached
 * @param {object} [contentStyle] - padding for the populated case
 */
export default function ResultsList({
  data,
  renderCard,
  emptyState,
  loadingMore,
  onEndReached,
  contentStyle,
  ...listProps
}) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      style={styles.list}
      contentContainerStyle={data.length === 0 ? styles.contentEmpty : [styles.content, contentStyle]}
      renderItem={({ item }) => renderCard(item)}
      ListEmptyComponent={emptyState}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color="#22c55e" />
            <AppText style={styles.footerLoaderText}>Loading more solutions...</AppText>
          </View>
        ) : null
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      {...listProps}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100 },
  // flexGrow lets the empty state occupy the full viewport instead of
  // collapsing to its content height at the top of the list.
  contentEmpty: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100, flexGrow: 1 },
  footerLoader: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  footerLoaderText: { color: '#999', fontSize: 12 },
});
