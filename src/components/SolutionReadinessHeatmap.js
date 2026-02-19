/**
 * What Solves What — Challenge × Solution Type grid.
 * Icons on axes, teal-to-violet color gradient by average readiness.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, Pressable,
  Modal, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NUM_COLS = 10;
const ICON_COLUMN_WIDTH = 28;
const CELL_GAP = 1;
const STOPS = [
  { t: 0, hex: '#ccfbf1' },
  { t: 0.25, hex: '#5eead4' },
  { t: 0.5, hex: '#0d9488' },
  { t: 0.75, hex: '#6d28d9' },
  { t: 1.0, hex: '#3b0764' },
];

function readinessToColor(avgReadiness, count) {
  if (count === 0 || avgReadiness <= 0) return '#f0f0f0';
  const t = Math.min(1, avgReadiness / 9);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i];
    const hi = STOPS[i + 1];
    if (t >= lo.t && t <= hi.t) {
      const s = (t - lo.t) / (hi.t - lo.t);
      return interpolateColor(lo.hex, hi.hex, s);
    }
  }
  return STOPS[STOPS.length - 1].hex;
}

function interpolateColor(hexFrom, hexTo, s) {
  const r1 = parseInt(hexFrom.slice(1, 3), 16);
  const g1 = parseInt(hexFrom.slice(3, 5), 16);
  const b1 = parseInt(hexFrom.slice(5, 7), 16);
  const r2 = parseInt(hexTo.slice(1, 3), 16);
  const g2 = parseInt(hexTo.slice(3, 5), 16);
  const b2 = parseInt(hexTo.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * s);
  const g = Math.round(g1 + (g2 - g1) * s);
  const b = Math.round(b1 + (b2 - b1) * s);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default function SolutionReadinessHeatmap({ visible, onClose, data, onCellPress }) {
  const [infoVisible, setInfoVisible] = useState(false);
  const [tooltipText, setTooltipText] = useState('');
  const tooltipTimerRef = useRef(null);

  const showTooltip = (text) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltipText(text);
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipText('');
      tooltipTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  }, []);

  if (!visible) return null;

  const loading = data == null;
  const screenWidth = Dimensions.get('window').width;
  const cellSize = Math.floor((screenWidth - ICON_COLUMN_WIDTH - 24) / NUM_COLS);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, {
          maxHeight: Dimensions.get('window').height * 0.75,
          maxWidth: Dimensions.get('window').width - 32,
        }]}>
          <View style={styles.headerRow}>
            <View style={{ width: 40 }} />
            <Text style={styles.headerTitle}>What Solves What</Text>
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
                  Rows are challenges, columns are solution types — long-press any icon to see its name.
                  Cell color shows average readiness: pale mint = early stage, deep purple = fully
                  field-tested and deployment-ready. Tap any cell to explore matching innovations.
                </Text>
              </View>
            </>
          )}
          {tooltipText ? (
            <View style={styles.iconTooltip}>
              <Text style={styles.iconTooltipText}>{tooltipText}</Text>
            </View>
          ) : null}
          {loading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : data?.rows?.length && data?.columns?.length ? (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator showsHorizontalScrollIndicator={false}>
              <View style={styles.grid}>
                {/* Header row — type icons */}
                <View style={[styles.row, { marginBottom: CELL_GAP }]}>
                  <View style={[styles.cornerCell, { width: ICON_COLUMN_WIDTH, height: cellSize }]} />
                  {data.columns.map((col) => (
                    <Pressable
                      key={col.id}
                      style={[
                        styles.headerCell,
                        { width: cellSize, height: cellSize, marginLeft: CELL_GAP },
                      ]}
                      onLongPress={() => showTooltip(col.name)}
                      delayLongPress={400}
                    >
                      <Ionicons
                        name={col.icon}
                        size={16}
                        color={col.iconColor || '#333'}
                      />
                    </Pressable>
                  ))}
                </View>
                {/* Data rows — challenge icon + cells */}
                {data.rows.map((row) => (
                  <View key={row.id} style={[styles.row, { marginBottom: CELL_GAP }]}>
                    <Pressable
                      style={[styles.rowLabelCell, { width: ICON_COLUMN_WIDTH, height: cellSize }]}
                      onLongPress={() => showTooltip(row.name)}
                      delayLongPress={400}
                    >
                      <Ionicons
                        name={row.icon}
                        size={16}
                        color={row.iconColor || '#333'}
                      />
                    </Pressable>
                    {data.columns.map((col) => {
                      const key = `${row.id}::${col.id}`;
                      const cellData = data.cells?.[key] || { count: 0, avgReadiness: 0 };
                      const color = readinessToColor(cellData.avgReadiness, cellData.count);
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
                              borderRadius: 3,
                            },
                          ]}
                          onPress={() => onCellPress && onCellPress(row.id, col.id)}
                          activeOpacity={0.7}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
          <View style={styles.infoFooter}>
            <TouchableOpacity
              onPress={() => setInfoVisible((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={16} color="#999" />
            </TouchableOpacity>
          </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  closeBtn: { padding: 8, marginRight: -8, width: 40, alignItems: 'flex-end' },
  tooltip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 12,
  },
  tooltipText: { fontSize: 11, color: '#e5e5e5', lineHeight: 16 },
  iconTooltip: {
    position: 'absolute',
    alignSelf: 'center',
    top: 70,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    zIndex: 10,
  },
  iconTooltipText: { fontSize: 11, color: '#fff' },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#999' },
  scroll: { maxHeight: 400 },
  grid: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  cornerCell: { alignItems: 'center', justifyContent: 'center' },
  rowLabelCell: { alignItems: 'center', justifyContent: 'center' },
  headerCell: { alignItems: 'center', justifyContent: 'center' },
  dataCell: {},
  infoFooter: { alignItems: 'center', marginTop: 12 },
});
