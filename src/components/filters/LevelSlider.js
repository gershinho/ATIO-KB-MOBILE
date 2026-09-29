import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from '../AppText';
import { COLORS } from '../../theme/fao';

/**
 * A "minimum level" picker: numbered dots that fill up to the chosen level,
 * three captions under the scale, and a description of the current selection.
 *
 * Readiness and adoption are both 1-9 scales presented identically, and
 * FilterPanel rendered them with two copies of this block differing only in the
 * level constant, the fill colour and the three captions.
 *
 * @param {string} title
 * @param {Array<{level: number, name: string, description: string}>} levels
 * @param {number} value - the currently selected minimum
 * @param {(level: number) => void} onChange
 * @param {string} color - fill for the selected range
 * @param {[string, string, string]} captions - low, middle and high scale labels
 */
export default function LevelSlider({ title, levels, value, onChange, color, captions }) {
  const selected = levels[value - 1];

  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      <View style={styles.sliderRow}>
        {levels.map((level) => {
          const filled = value <= level.level;
          return (
            <TouchableOpacity
              key={level.level}
              style={[styles.sliderDot, filled && { backgroundColor: color }]}
              onPress={() => onChange(level.level)}
              accessibilityRole="button"
              accessibilityLabel={`${level.level}, ${level.name}`}
              accessibilityState={{ selected: value === level.level }}
            >
              <AppText style={[styles.sliderDotText, filled && styles.sliderDotTextFilled]}>
                {level.level}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.sliderLabels}>
        {captions.map((caption) => (
          <AppText key={caption} style={styles.sliderLabel}>{caption}</AppText>
        ))}
      </View>
      {selected && (
        <View style={styles.sliderInfo}>
          <AppText style={styles.sliderInfoTitle}>{selected.name} ({value})</AppText>
          <AppText style={styles.sliderInfoDesc}>{selected.description}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12, color: COLORS.textHeading },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  sliderDot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  sliderDotText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  sliderDotTextFilled: { color: COLORS.textInverse },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sliderLabel: { fontSize: 11, color: COLORS.textMuted },
  sliderInfo: { marginTop: 10, padding: 10, backgroundColor: COLORS.surfaceSunken, borderRadius: 8 },
  sliderInfoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textHeading, marginBottom: 2 },
  sliderInfoDesc: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
});
