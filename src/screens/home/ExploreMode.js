import React, { useContext, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGES, TYPES } from '../../data/constants';
import { AccessibilityContext } from '../../context/AccessibilityContext';
import BouncingLoader from '../../components/BouncingLoader';
import InnovationCard from '../../components/InnovationCard';
import useExploreData from '../../hooks/useExploreData';
import { challengeTarget, typeTarget, regionTarget, allTarget } from './drilldownTargets';

/**
 * The Explore half of Home: headline stats, the challenge and type grids,
 * innovation hubs, and recent solutions.
 *
 * Owns its own data, which is safe because the previous implementation
 * re-fetched on every switch into Explore anyway. `onOpenDrilldown` is the
 * drilldown hook's `open`, held by the shell because the heat maps on the
 * Search side open drilldowns too.
 */
export default function ExploreMode({ interactions, onOpenDrilldown }) {
  const { reduceMotion, getScaledSize } = useContext(AccessibilityContext);
  const explore = useExploreData();
  const { load } = explore;

  useEffect(() => {
    load();
  }, [load]);

  if (explore.loading) {
    return (
      <View style={styles.loadingContainer}>
        <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
        <Text style={styles.loadingText}>Loading ATIO database...</Text>
      </View>
    );
  }

  if (explore.error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.errorTitle, { fontSize: getScaledSize(16) }]}>Could not load database</Text>
        <Text style={[styles.errorText, { fontSize: getScaledSize(13) }]}>{explore.error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderCard = (item) => {
    const innovation = interactions.withCounts(item);
    return (
      <InnovationCard
        innovation={innovation}
        onLearnMore={() => interactions.openDrawer(innovation)}
        isBookmarked={interactions.isBookmarked(innovation.id)}
        onBookmark={interactions.toggleBookmark}
        onDownload={interactions.addDownload}
        onThumbsUp={interactions.handleThumbsUp}
        onComments={interactions.openComments}
        isLiked={interactions.isLiked(innovation.id)}
      />
    );
  };

  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.statsRow}>
        <Stat value={explore.stats.innovations.toLocaleString()} label="SOLUTIONS" />
        <Stat value={`${explore.stats.countries}+`} label="COUNTRIES" bordered />
        <Stat value={explore.stats.sdgs} label="SDGS" />
      </View>

      <Text style={styles.sectionHeader}>WHAT'S THE CHALLENGE?</Text>
      <View style={styles.grid}>
        {CHALLENGES.map((challenge) => (
          <TouchableOpacity
            key={challenge.id}
            style={styles.gridItem}
            onPress={() => onOpenDrilldown(challengeTarget(challenge))}
            accessibilityRole="button"
          >
            <Ionicons name={challenge.icon} size={22} color={challenge.iconColor || '#333'} />
            <View style={styles.gridItemText}>
              <Text style={[styles.gridName, { fontSize: getScaledSize(12) }]}>{challenge.name}</Text>
              <Text style={styles.gridSub}>
                {(explore.challengeCounts[challenge.id] || 0).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionHeader}>WHAT KIND OF SOLUTION?</Text>
      <View style={styles.grid}>
        {TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={styles.gridItem}
            onPress={() => onOpenDrilldown(typeTarget(type))}
            accessibilityRole="button"
          >
            <Ionicons name={type.icon} size={22} color={type.iconColor || '#333'} />
            <View style={styles.gridItemText}>
              <Text style={[styles.gridName, { fontSize: getScaledSize(12) }]}>{type.name}</Text>
              <Text style={styles.gridSub}>
                {(explore.typeCounts[type.id] || 0).toLocaleString()} solutions
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionHeader}>INNOVATION HUBS</Text>
      <View style={styles.pillsWrap}>
        {explore.topRegions.map((region) => (
          <TouchableOpacity
            key={region.id}
            style={styles.pillCountry}
            onPress={() => onOpenDrilldown(regionTarget(region))}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.pillTextCountry} numberOfLines={1}>{region.name}</Text>
            <Text style={styles.pillCount}>{region.count}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionHeader}>RECENT SOLUTIONS</Text>
      {explore.recentInnovations.map((innovation) => (
        <View key={innovation.id}>{renderCard(innovation)}</View>
      ))}

      <TouchableOpacity
        style={styles.browseAllBtn}
        onPress={() => onOpenDrilldown(allTarget())}
        accessibilityRole="button"
      >
        <Text style={[styles.browseAllText, { fontSize: getScaledSize(14) }]}>
          Browse All {explore.stats.innovations.toLocaleString()} Solutions →
        </Text>
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function Stat({ value, label, bordered }) {
  return (
    <View style={[styles.statItem, bordered && styles.statBorder]}>
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#999', fontSize: 13 },
  errorTitle: { fontWeight: '600', color: '#111', marginBottom: 8, textAlign: 'center' },
  errorText: { color: '#666', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden', marginTop: 16 },
  statItem: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e5e7eb' },
  statNum: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, color: '#999', fontWeight: '600', letterSpacing: 0.3, marginTop: 4 },
  sectionHeader: { fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '48%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gridItemText: { flex: 1 },
  gridName: { fontWeight: '600' },
  gridSub: { fontSize: 10, color: '#999', marginTop: 2 },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pillCountry: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillTextCountry: { fontSize: 11, fontWeight: '500' },
  pillCount: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  browseAllBtn: { backgroundColor: '#000', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  browseAllText: { color: '#fff', fontWeight: '600' },
  bottomSpacer: { height: 100 },
});
