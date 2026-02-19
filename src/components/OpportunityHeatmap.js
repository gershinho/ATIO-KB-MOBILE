/**
 * Adoption Opportunity Heat Map — Region × Challenge grid.
 * Color intensity = opportunity gap (high readiness, low adoption = hot).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGES } from '../data/constants';
import { getOpportunityHeatmapData } from '../database/db';

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

export default function OpportunityHeatmap({ onCellPress }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOpportunityHeatmapData()
      .then((d) => {
        if (!cancelled) {
          setData(d);
        }
      })
      .catch((e) => {
        if (!cancelled) console.warn('[OpportunityHeatmap]', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  if (!data || !data.rows?.length || !data.cols?.length) return null;

  const { rows, cols, cells } = data;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>ADOPTION OPPORTUNITIES</Text>
      <Text style={styles.explanation}>Bright = proven innovations that haven&apos;t spread yet</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollWrap}>
        <View style={styles.grid}>
          {/* Header row */}
          <View style={styles.row}>
            <View style={[styles.cornerCell, styles.rowLabelCell]} />
            {cols.map((cid) => {
              const c = CHALLENGES.find((x) => x.id === cid);
              return (
                <View key={cid} style={[styles.headerCell]}>
                  {c && <Ionicons name={c.icon} size={16} color={c.iconColor || '#333'} />}
                </View>
              );
            })}
          </View>
          {/* Data rows */}
          {rows.map((regionName) => (
            <View key={regionName} style={styles.row}>
              <View style={[styles.rowLabelCell, styles.rowLabelCellInner]}>
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {ROW_LABELS[regionName] || regionName}
                </Text>
              </View>
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
                    style={[styles.dataCell, { backgroundColor: color }]}
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
  );
}

const CELL_SIZE = 36;
const CELL_GAP = 2;
const ROW_LABEL_WIDTH = 70;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 28;

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionTitle: { fontSize: 12, color: '#999', marginBottom: 4 },
  explanation: { fontSize: 10, color: '#bbb', marginBottom: 8 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  scrollWrap: { marginHorizontal: -20 },
  grid: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
    padding: CELL_GAP,
  },
  row: {
    flexDirection: 'row',
    marginBottom: CELL_GAP,
  },
  cornerCell: {
    width: ROW_LABEL_WIDTH,
    height: HEADER_HEIGHT,
  },
  rowLabelCell: {
    width: ROW_LABEL_WIDTH,
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 4,
  },
  rowLabelCellInner: {
    width: ROW_LABEL_WIDTH,
    height: ROW_HEIGHT,
  },
  headerCell: {
    width: CELL_SIZE,
    height: HEADER_HEIGHT,
    marginLeft: CELL_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataCell: {
    width: CELL_SIZE,
    height: ROW_HEIGHT,
    marginLeft: CELL_GAP,
  },
  rowLabel: { fontSize: 9, color: '#666' },
});
