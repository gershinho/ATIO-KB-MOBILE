/**
 * Ready to Use — Challenge × Solution Type grid.
 * Color = average readiness level (pale sage → deep violet).
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, Pressable,
  Modal, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHALLENGES, TYPES } from '../data/constants';

const ICON_COLUMN_WIDTH = 32;
const STOPS = [
  { t: 0, hex: '#dcfce7' },
  { t: 0.25, hex: '#5eead4' },
  { t: 0.5, hex: '#38bdf8' },
  { t: 0.75, hex: '#6366f1' },
  { t: 1.0, hex: '#7c3aed' },
];

function readinessToColor(avgReadiness, count) {
  if (count === 0 || avgReadiness <= 0) return '#f3f4f6';
  const t = Math.min(1, Math.max(0, avgReadiness / 9));
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

export default function ReadyToUseHeatmap({ visible, onClose, data, onCellPress }) {
  const insets = useSafeAreaInsets();
  const [infoVisible, setInfoVisible] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimerRef = useRef(null);

  const showTooltip = (text, duration = 1500) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip({ text, x: 0, y: 0 });
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip(null);
      tooltipTimerRef.current = null;
    }, duration);
  };

  useEffect(() => () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  }, []);

  if (!visible) return null;

  const loading = data == null;
  const screenWidth = Dimensions.get('window').width;
  const cellSize = Math.floor((screenWidth - ICON_COLUMN_WIDTH - 24) / 10);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Ready to Use</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#555" />
          </TouchableOpacity>
        </View>
        {infoVisible && (
          <>
            <TouchableWithoutFeedback onPress={() => setInfoVisible(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                This grid maps challenges (left icons) against solution types (top icons).
                Long-press any icon to see its name.{'\n\n'}
                Cell color shows how field-tested solutions are at that intersection:{'\n'}
                • Pale sage = early-stage ideas{'\n'}
                • Teal → Blue = moderate testing{'\n'}
                • Indigo → Violet = fully proven and deployment-ready{'\n'}
                • Gray = no innovations found for that combination{'\n\n'}
                Tap a cell to explore the matching innovations. Long-press a cell to see exact numbers.
              </Text>
            </View>
          </>
        )}
        {tooltip ? (
          <View style={[styles.tooltipBox, { left: 16, top: 120 }]}>
            <Text style={styles.tooltipText}>{tooltip.text}</Text>
          </View>
        ) : null}
        {loading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : data?.rows?.length && data?.columns?.length ? (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator>
            <View style={styles.grid}>
              <View style={styles.row}>
                <View style={[styles.corner, { width: ICON_COLUMN_WIDTH, height: cellSize }]} />
                {data.columns.map((col) => (
                  <Pressable
                    key={col.id}
                    style={[styles.headerCell, { width: cellSize, height: cellSize, margin: 1 }]}
                    onLongPress={() => showTooltip(col.name)}
                    delayLongPress={400}
                  >
                    <Ionicons name={col.icon} size={18} color={col.iconColor || '#333'} />
                  </Pressable>
                ))}
              </View>
              {data.rows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <Pressable
                    style={[styles.rowHeader, { width: ICON_COLUMN_WIDTH, height: cellSize }]}
                    onLongPress={() => showTooltip(row.name)}
                    delayLongPress={400}
                  >
                    <Ionicons name={row.icon} size={18} color={row.iconColor || '#333'} />
                  </Pressable>
                  {data.columns.map((col) => {
                    const key = `${row.id}::${col.id}`;
                    const cellData = data.cells?.[key] || { count: 0, avgReadiness: 0 };
                    const color = readinessToColor(cellData.avgReadiness, cellData.count);
                    const challenge = CHALLENGES.find((c) => c.id === row.id);
                    const type = TYPES.find((t) => t.id === col.id);
                    const cellTooltip = `${challenge?.name || row.id} × ${type?.name || col.id}: Avg readiness ${cellData.avgReadiness.toFixed(1)}/9 (${cellData.count} innovations)`;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.cell,
                          { width: cellSize, height: cellSize, margin: 1, backgroundColor: color, borderRadius: 4 },
                        ]}
                        onPress={() => onCellPress && onCellPress(row.id, col.id)}
                        onLongPress={() => showTooltip(cellTooltip, 2000)}
                        delayLongPress={400}
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
          <TouchableOpacity onPress={() => setInfoVisible((v) => !v)} activeOpacity={0.7}>
            <Ionicons name="information-circle-outline" size={18} color="#aaa" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  closeBtn: { padding: 8, width: 40, alignItems: 'flex-end' },
  infoBox: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  infoText: { fontSize: 11, color: '#e5e5e5', lineHeight: 17 },
  tooltipBox: {
    position: 'absolute',
    backgroundColor: '#111',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    zIndex: 10,
  },
  tooltipText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#999' },
  scroll: { flex: 1 },
  grid: { paddingHorizontal: 12, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  corner: {},
  rowHeader: { alignItems: 'center', justifyContent: 'center' },
  headerCell: { alignItems: 'center', justifyContent: 'center' },
  cell: {},
  infoFooter: { alignItems: 'center', paddingVertical: 16 },
});
