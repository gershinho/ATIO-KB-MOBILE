import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Characters beyond which a two-line clamp is likely hiding something. */
const TRUNCATE_THRESHOLD = 60;

/**
 * One labelled A-vs-B row, each side independently expandable.
 *
 * Expansion state used to live in the parent as a single `expandedCells` map
 * keyed by `${label}-A` / `${label}-B`, which meant every one of the ten call
 * sites hand-threaded four extra props — `expandedA`, `expandedB`, `onToggleA`,
 * `onToggleB` — and had to spell the same key twice without a typo. Which side
 * of a row is open is nobody else's business, so it lives here now.
 */
export default function ComparisonRow({ label, a, b, aFull, bFull }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.cells}>
        <Cell style={styles.colA} short={a} full={aFull} />
        <View style={styles.divider} />
        <Cell style={styles.colB} short={b} full={bFull} />
      </View>
    </View>
  );
}

/**
 * One side of a row.
 *
 * `short` is the display value, `full` the untruncated one when the caller had
 * to cap a list. There is more to show when a distinct `full` exists, or when
 * `short` alone is long enough that the two-line clamp will bite.
 */
function Cell({ style, short, full }) {
  const [expanded, setExpanded] = useState(false);
  const display = short || '—';
  const hasContent = display !== '—' && String(display).trim().length > 0;
  const hasFull = full != null && full !== '' && full !== display;
  const canExpand = hasContent && (hasFull || String(display).length > TRUNCATE_THRESHOLD);
  const text = expanded && hasFull ? full : display;

  return (
    <View style={[styles.cellWrap, style]}>
      <TouchableOpacity
        onPress={canExpand ? () => setExpanded((open) => !open) : undefined}
        activeOpacity={canExpand ? 0.7 : 1}
        disabled={!canExpand}
        accessibilityRole={canExpand ? 'button' : undefined}
        accessibilityState={canExpand ? { expanded } : undefined}
      >
        <Text
          style={styles.cellText}
          numberOfLines={expanded ? undefined : 2}
          ellipsizeMode={expanded ? undefined : 'tail'}
        >
          {text}
        </Text>
        {canExpand && <Text style={styles.toggle}>{expanded ? 'Show less' : 'more'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  cells: { flexDirection: 'row', alignItems: 'stretch' },
  cellWrap: { flex: 1, minWidth: 0 },
  colA: { flex: 1, paddingRight: 8 },
  colB: { flex: 1, paddingLeft: 8 },
  divider: { width: 1, backgroundColor: '#e2e8f0', marginVertical: 2 },
  cellText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  toggle: { fontSize: 12, color: '#3b82f6', marginTop: 2 },
});
