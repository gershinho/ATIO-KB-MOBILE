/**
 * Adoption Opportunity Heat Map — Region × Challenge grid.
 * Color intensity = opportunity gap (high readiness, low adoption = hot).
 * Region labels anchored left; challenge columns scroll horizontally.
 */
import React, { useState } from 'react';
import {
  View, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator,
  Modal, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGES } from '../data/constants';
import AppText from './AppText';

const CELL_GAP = 2;
const ROW_LABEL_WIDTH = 55;
const CELL_SIZE = 28;

const ROW_LABELS = {
  'East Africa': 'E. Africa',
  'West Africa': 'W. Africa',
  'Southern Africa': 'S. Africa',
  'Central Africa': 'C. Africa',
  'North Africa': 'N. Africa',
  'South Asia': 'S. Asia',
  'East Asia': 'E. Asia',
  'Southeast Asia': 'SE Asia',
  'Middle East & Central Asia': 'Mid East',
  'North America': 'N. America',
  'Central America & Caribbean': 'C. Am & Car',
  'South America': 'S. America',
  'Western Europe': 'W. Europe',
  'Northern & Eastern Europe': 'N&E Europe',
  'Oceania & Pacific': 'Oceania',
};

function getCellColor(opportunityScore, count) {
  if (count < 3) return '#f3f3f3';
  if (opportunityScore < 0.1) return '#f3f3f3';
  if (opportunityScore < 1.0) return '#fef3c7';
  if (opportunityScore < 2.0) return '#fde68a';
  if (opportunityScore < 3.0) return '#fdba74';
  return '#f97316';
}

/**
 * The grid itself. The parent owns the data; this used to support a second,
 * self-fetching mode chosen implicitly by whether `data` was undefined, but the
 * only caller always supplied it, so that branch never ran and the component
 * reached into the database layer for nothing.
 *
 * @param {{rows: Array, cols: Array, cells: object}|null} data - null while loading
 */
function HeatmapGrid({ onCellPress, data }) {
  if (data == null) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  if (!data.rows?.length || !data.cols?.length) return null;

  const { rows, cols, cells } = data;
  const iconSize = Math.min(14, CELL_SIZE - 4);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <View style={styles.mainRow}>
          {/* Fixed left: corner + region labels */}
          <View style={styles.fixedLeft}>
            <View style={[styles.cornerCell, { width: ROW_LABEL_WIDTH, height: CELL_SIZE }]} />
            {rows.map((regionName) => (
              <View
                key={regionName}
                style={[styles.rowLabelCell, { width: ROW_LABEL_WIDTH, height: CELL_SIZE }]}
              >
                <AppText style={styles.rowLabel} numberOfLines={2}>
                  {ROW_LABELS[regionName] || regionName}
                </AppText>
              </View>
            ))}
          </View>
          {/* Scrollable right: challenge columns */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.scrollRight}
            contentContainerStyle={styles.scrollContent}
          >
            <View>
              {/* Header row */}
              <View style={[styles.row, { marginBottom: CELL_GAP }]}>
                {cols.map((cid) => {
                  const c = CHALLENGES.find((x) => x.id === cid);
                  return (
                    <View
                      key={cid}
                      style={[
                        styles.headerCell,
                        { width: CELL_SIZE, height: CELL_SIZE, marginLeft: CELL_GAP },
                      ]}
                    >
                      {c && <Ionicons name={c.icon} size={iconSize} color={c.iconColor || '#333'} />}
                    </View>
                  );
                })}
              </View>
              {/* Data rows */}
              {rows.map((regionName) => (
                <View key={regionName} style={[styles.row, { marginBottom: CELL_GAP }]}>
                  {cols.map((cid) => {
                    const cellData = cells[regionName]?.[cid] || {
                      count: 0,
                      avgReadiness: 0,
                      avgAdoption: 0,
                      opportunityScore: 0,
                    };
                    const color = getCellColor(cellData.opportunityScore, cellData.count);
                    return (
                      <TouchableOpacity
                        key={`${regionName}-${cid}`}
                        style={[
                          styles.dataCell,
                          {
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            marginLeft: CELL_GAP,
                            backgroundColor: color,
                          },
                        ]}
                        onPress={() => onCellPress && onCellPress(regionName, cid)}
                        activeOpacity={0.7}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/**
 * Adoption Opportunities, as a self-contained modal.
 *
 * The chrome — overlay, sheet, title bar, close button, the collapsible
 * explainer — used to be hand-rolled by HomeScreen across 45 lines, while this
 * component's sibling ReadyToUseHeatmap owned exactly that chrome itself. Two
 * heat maps, opposite boundaries, so the two call sites could not look alike.
 * They now take the same props and each own their own presentation.
 *
 * @param {boolean} visible
 * @param {() => void} onClose
 * @param {{rows: Array, cols: Array, cells: object}|null} data - null while loading
 * @param {(regionName: string, challengeId: string) => void} onCellPress
 */
export default function OpportunityHeatmap({ visible, onClose, data, onCellPress }) {
  const [infoVisible, setInfoVisible] = useState(false);
  // Read at render rather than frozen at import, so the sheet is sized
  // correctly after a rotation.
  const { width, height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { maxHeight: height * 0.75, maxWidth: width - 32 }]}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setInfoVisible((v) => !v)}
              style={styles.infoBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="What this heat map shows"
            >
              <Ionicons name="information-circle-outline" size={28} color="#999" />
            </TouchableOpacity>
            <AppText style={[styles.headerTitle, { flex: 1 }]}>Adoption Opportunities</AppText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#555" />
            </TouchableOpacity>
          </View>
          {infoVisible && (
            <>
              <TouchableWithoutFeedback onPress={() => setInfoVisible(false)}>
                <View style={[StyleSheet.absoluteFill, styles.infoDismissLayer]} />
              </TouchableWithoutFeedback>
              <View style={styles.infoPanel}>
                <AppText style={styles.infoText}>
                  Each cell shows innovations at the intersection of a region and challenge.
                  Brighter orange = higher readiness but lower adoption — proven solutions
                  that haven't spread yet, representing the biggest opportunities for impact.
                </AppText>
              </View>
            </>
          )}
          <HeatmapGrid data={data} onCellPress={onCellPress} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
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
  infoBtn: { padding: 4, marginRight: 4 },
  closeBtn: { padding: 8, marginRight: -8 },
  infoDismissLayer: { backgroundColor: 'transparent' },
  infoPanel: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 12,
  },
  infoText: { fontSize: 11, color: '#e5e5e5', lineHeight: 16 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  grid: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  mainRow: { flexDirection: 'row', width: '100%' },
  fixedLeft: {
    backgroundColor: '#f9fafb',
  },
  cornerCell: { justifyContent: 'center', paddingLeft: 4, marginBottom: CELL_GAP },
  rowLabelCell: {
    justifyContent: 'center',
    paddingLeft: 4,
    marginBottom: CELL_GAP,
  },
  scrollRight: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  row: { flexDirection: 'row' },
  headerCell: { alignItems: 'center', justifyContent: 'center' },
  dataCell: {},
  rowLabel: { fontSize: 8, color: '#666' },
});
