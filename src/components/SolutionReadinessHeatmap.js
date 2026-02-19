/**
 * What Solves What — Challenge × Solution Type grid.
 * Color intensity = average readiness level (deeper blue = more field-tested).
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Modal, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NUM_COLS = 10;
const CELL_GAP = 2;
const ROW_LABEL_WIDTH = 90;

function truncate(str, max = 12) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function getCellColor(avgReadiness, count) {
  if (count === 0 || avgReadiness <= 0) return '#f5f5f5';
  const t = Math.min(1, avgReadiness / 9);
  if (t < 0.5) {
    const s = t * 2;
    return interpolateColor('#f0f0f0', '#60a5fa', s);
  }
  return interpolateColor('#60a5fa', '#1d4ed8', (t - 0.5) * 2);
}

function interpolateColor(hexFrom, hexTo, t) {
  const r1 = parseInt(hexFrom.slice(1, 3), 16);
  const g1 = parseInt(hexFrom.slice(3, 5), 16);
  const b1 = parseInt(hexFrom.slice(5, 7), 16);
  const r2 = parseInt(hexTo.slice(1, 3), 16);
  const g2 = parseInt(hexTo.slice(3, 5), 16);
  const b2 = parseInt(hexTo.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default function SolutionReadinessHeatmap({ visible, onClose, data, onCellPress }) {
  const [infoVisible, setInfoVisible] = useState(false);

  if (!visible) return null;

  const loading = data == null;
  const screenWidth = Dimensions.get('window').width;
  const contentWidth = screenWidth - 32 - 40;
  const cellsTotalWidth = contentWidth - ROW_LABEL_WIDTH - (NUM_COLS - 1) * CELL_GAP;
  const cellSize = Math.max(14, Math.floor(cellsTotalWidth / NUM_COLS));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, {
          maxHeight: Dimensions.get('window').height * 0.75,
          maxWidth: Dimensions.get('window').width - 32,
        }]}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setInfoVisible((v) => !v)}
              style={{ padding: 4, marginRight: 4 }}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={16} color="#999" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { flex: 1 }]}>What Solves What</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#555" />
            </TouchableOpacity>
          </View>
          {infoVisible && (
            <>
              <TouchableWithoutFeedback onPress={() => setInfoVisible(false)}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} />
              </TouchableWithoutFeedback>
              <View style={styles.tooltip}>
                <Text style={styles.tooltipText}>
                  Each cell shows innovations at the intersection of a challenge and solution type.
                  Deeper blue = higher average readiness level — these are the most field-tested,
                  deployment-ready solutions for that specific problem and approach combination.
                </Text>
              </View>
            </>
          )}
          {loading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : data?.rows?.length && data?.columns?.length ? (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator showsHorizontalScrollIndicator={false}>
              <View style={styles.grid}>
                {/* Header row */}
                <View style={[styles.row, { marginBottom: CELL_GAP }]}>
                  <View style={[styles.cornerCell, { width: ROW_LABEL_WIDTH, height: cellSize }]} />
                  {data.columns.map((col) => (
                    <View
                      key={col.id}
                      style={[
                        styles.headerCell,
                        { width: cellSize, height: cellSize, marginLeft: CELL_GAP },
                      ]}
                    >
                      <Text style={styles.headerLabel} numberOfLines={2}>
                        {truncate(col.name, 10)}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {data.rows.map((row) => (
                  <View key={row.id} style={[styles.row, { marginBottom: CELL_GAP }]}>
                    <View style={[styles.rowLabelCell, { width: ROW_LABEL_WIDTH, height: cellSize }]}>
                      <Text style={styles.rowLabel} numberOfLines={2}>
                        {truncate(row.name)}
                      </Text>
                    </View>
                    {data.columns.map((col) => {
                      const key = `${row.id}::${col.id}`;
                      const cellData = data.cells?.[key] || { count: 0, avgReadiness: 0 };
                      const color = getCellColor(cellData.avgReadiness, cellData.count);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.dataCell,
                            {
                              width: cellSize,
                              height: cellSize,
                              marginLeft: CELL_GAP,
                              backgroundColor: color,
                            },
                          ]}
                          onPress={() => onCellPress && onCellPress(row.id, col.id)}
                          activeOpacity={0.7}
                        >
                          {cellData.count > 0 && (
                            <Text style={styles.cellCount}>{cellData.count}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 8, marginRight: -8 },
  tooltip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 12,
  },
  tooltipText: { fontSize: 11, color: '#e5e5e5', lineHeight: 16 },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#999' },
  scroll: { maxHeight: 400 },
  grid: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  cornerCell: {},
  rowLabelCell: { justifyContent: 'center', paddingLeft: 4 },
  headerCell: { alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 8, color: '#666' },
  dataCell: { alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 9, color: '#666' },
  cellCount: { fontSize: 8, color: '#333', fontWeight: '600' },
});
