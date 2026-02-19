/**
 * Adoption Opportunity Heat Map — Region × Challenge grid.
 * Color intensity = opportunity gap (high readiness, low adoption = hot).
 * Region labels anchored left; challenge columns scroll horizontally.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGES } from '../data/constants';
import { getOpportunityHeatmapData } from '../database/db';

const NUM_COLS = 12;
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

export default function OpportunityHeatmap({ onCellPress, data: dataProp }) {
  const [internalData, setInternalData] = useState(null);
  const isParentControlled = dataProp !== undefined;
  const loading = isParentControlled ? dataProp == null : !internalData;
  const data = isParentControlled ? dataProp : internalData;

  useEffect(() => {
    if (isParentControlled) return;
    let cancelled = false;
    getOpportunityHeatmapData()
      .then((d) => {
        if (!cancelled) setInternalData(d);
      })
      .catch((e) => {
        if (!cancelled) console.warn('[OpportunityHeatmap]', e);
      });
    return () => { cancelled = true; };
  }, [isParentControlled]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  if (!data || !data.rows?.length || !data.cols?.length) return null;

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
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {ROW_LABELS[regionName] || regionName}
                </Text>
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

const styles = StyleSheet.create({
  container: {},
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  grid: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  mainRow: { flexDirection: 'row' },
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
