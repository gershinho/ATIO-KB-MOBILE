import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from '../AppText';

/**
 * A titled grid of toggle chips over a fixed option set.
 *
 * Regions, user groups, cost and complexity are all "pick any of these" and
 * were each written out as their own copy of this block, differing only in the
 * option list, how an option's id and label are read, and the fill colour.
 *
 * @param {string} title
 * @param {Array} options
 * @param {(option: any) => string} getValue - the value stored in the filter
 * @param {(option: any) => string} getLabel
 * @param {string[]} selected
 * @param {(value: string) => void} onToggle
 * @param {string} color - fill for a selected chip
 * @param {(option: any) => string} [getColor] - per-option override, e.g. region colours
 */
export default function ChipMultiSelect({ title, ...chipRowProps }) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      <ChipRow {...chipRowProps} />
    </View>
  );
}

/**
 * The grid on its own, for a section that has more in it than the chips — the
 * region picker also carries a country search underneath.
 */
export function ChipRow({ options, getValue, getLabel, selected, onToggle, color, getColor }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const value = getValue(option);
        const on = selected.includes(value);
        const chipColor = getColor?.(option) || color;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.chip, on && { backgroundColor: chipColor, borderColor: chipColor }]}
            onPress={() => onToggle(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <AppText style={[styles.chipText, on && styles.chipTextOn]}>{getLabel(option)}</AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12, color: '#111' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextOn: { color: '#fff' },
});
