import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * The Search / Explore segmented control at the top of Home.
 *
 * This markup was written out five times inline across HomeScreen's render
 * branches, and the copies had already drifted: two of them wired the Explore
 * pill to `setMode('explore')` while the drilldown branch wired it to
 * `setDrilldownVisible(false)`. Both behaviours are still expressible — the
 * caller supplies `onSelect` — but there is now one place that decides how the
 * control looks.
 *
 * @param {'search'|'explore'} mode - which pill reads as active
 * @param {(mode: 'search'|'explore') => void} onSelect
 */
export default function ModePills({ mode, onSelect }) {
  return (
    <View style={styles.pillWrap}>
      <TouchableOpacity
        style={[styles.pill, mode === 'search' && styles.pillActive]}
        onPress={() => onSelect('search')}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'search' }}
      >
        <Text style={[styles.pillText, mode === 'search' && styles.pillTextActive]}>Search</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, mode === 'explore' && styles.pillActive]}
        onPress={() => onSelect('explore')}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'explore' }}
      >
        <Text style={[styles.pillText, mode === 'explore' && styles.pillTextActive]}>Explore</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    flexDirection: 'row',
    backgroundColor: '#f3f3f3',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 999,
    padding: 4,
  },
  pill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  pillActive: { backgroundColor: '#000' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#666' },
  pillTextActive: { color: '#fff' },
});
