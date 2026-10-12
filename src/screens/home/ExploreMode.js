import React, { useContext, useEffect } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '../../components/icons/Icon';
import { CHALLENGES, TYPES } from '../../data/constants';
import { AccessibilityContext } from '../../context/AccessibilityContext';
import BouncingLoader from '../../components/BouncingLoader';
import InteractiveInnovationCard from '../../components/InteractiveInnovationCard';
import useExploreData from '../../hooks/useExploreData';
import useOnReconnect from '../../hooks/useOnReconnect';
import { challengeTarget, typeTarget, regionTarget, allTarget } from './drilldownTargets';
import AppText from '../../components/AppText';
import { COLORS, RADIUS } from '../../theme/fao';

/**
 * @typedef {import('../../hooks/useInnovationInteractions').InnovationInteractions} InnovationInteractions
 */


/**
 * The Explore half of Home: headline stats, the challenge and type grids,
 * innovation hubs, and recent solutions.
 *
 * Owns its own data, which is safe because the previous implementation
 * re-fetched on every switch into Explore anyway. `onOpenDrilldown` is the
 * drilldown hook's `open`, held by the shell because the heat-map modals it
 * renders open drilldowns too.
 *
 * Each heat map sits after the lists it crosses: Ready to Use (challenge ×
 * type) under the type grid, Adoption Opportunities (region × challenge) under
 * the hubs. A cell then opens a drilldown on this same page.
 *
 * @param {InnovationInteractions} interactions
 * @param {(target: object) => Promise<void>} onOpenDrilldown - useDrilldown's `open`
 * @param {() => void} onOpenOpportunityHeatmap
 * @param {() => void} onOpenReadyHeatmap
 */
export default function ExploreMode({
  interactions,
  onOpenDrilldown,
  onOpenOpportunityHeatmap,
  onOpenReadyHeatmap,
}) {
  const { reduceMotion } = useContext(AccessibilityContext);
  const explore = useExploreData();
  const { load } = explore;

  useEffect(() => {
    load();
  }, [load]);

  // Reload when the connection comes back, so the saved figures (or the error,
  // with nothing saved) do not outlive the outage.
  const online = useOnReconnect(load);

  if (explore.loading) {
    return (
      <View style={styles.loadingContainer}>
        <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
        <AppText style={styles.loadingText}>Loading ATIO database...</AppText>
      </View>
    );
  }

  if (explore.error) {
    return (
      <View style={styles.loadingContainer}>
        {/* Not "database": on web there is no database, and the message a
            user met offline named a thing that does not exist on the platform
            they were using. */}
        <AppText style={styles.errorTitle}>Could not load these innovations</AppText>
        <AppText style={styles.errorText}>{explore.error}</AppText>
        <TouchableOpacity style={styles.retryBtn} onPress={load} accessibilityRole="button">
          <AppText style={styles.retryBtnText}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const renderCard = (item) => (
    <InteractiveInnovationCard item={item} interactions={interactions} />
  );

  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      {explore.fromCache && (
        <View style={styles.offlineNote}>
          <AppText style={styles.offlineNoteText}>
            {/* fromCache means the portal could not be reached, which is not
                the same as being offline: the dev proxy down, or FAO slow. */}
            {online ? 'Could not reach the FAO catalogue' : 'You are offline'} — these figures are from the copy saved on this device.
          </AppText>
        </View>
      )}
      <View style={styles.statsRow}>
        <Stat value={explore.stats.innovations.toLocaleString()} label="INNOVATIONS" />
        <Stat value={`${explore.stats.countries}+`} label="COUNTRIES" bordered />
        <Stat value={explore.stats.sdgs} label="SDGS" />
      </View>

      <AppText style={styles.sectionHeader}>WHAT'S THE CHALLENGE?</AppText>
      <View style={styles.grid}>
        {CHALLENGES.map((challenge) => (
          <TouchableOpacity
            key={challenge.id}
            style={styles.gridItem}
            onPress={() => onOpenDrilldown(challengeTarget(challenge))}
            accessibilityRole="button"
          >
            <Icon name={challenge.icon} size={22} color={challenge.iconColor || COLORS.textBody} />
            <View style={styles.gridItemText}>
              <AppText style={styles.gridName}>{challenge.name}</AppText>
              <AppText style={styles.gridSub}>
                {/* Per tile, not per grid: a challenge shows its number as
                    soon as that number exists, rather than waiting for the
                    other eleven. Against a cold portal that is the difference
                    between a grid that fills and one that looks stuck. */}
                {typeof explore.challengeCounts[challenge.id] === 'number'
                  ? explore.challengeCounts[challenge.id].toLocaleString()
                  : 'counting…'}
              </AppText>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <AppText style={styles.sectionHeader}>WHAT KIND OF INNOVATION?</AppText>
      <View style={styles.grid}>
        {TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={styles.gridItem}
            onPress={() => onOpenDrilldown(typeTarget(type))}
            accessibilityRole="button"
          >
            <Icon name={type.icon} size={22} color={type.iconColor || COLORS.textBody} />
            <View style={styles.gridItemText}>
              <AppText style={styles.gridName}>{type.name}</AppText>
              <AppText style={styles.gridSub}>
                {typeof explore.typeCounts[type.id] === 'number'
                  ? `${explore.typeCounts[type.id].toLocaleString()} innovations`
                  : 'counting…'}
              </AppText>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {online && (
        <InsightCard
          icon="checkmark-circle-outline"
          iconColor={COLORS.primary}
          tint={COLORS.primaryLight}
          title="Ready to Use"
          body="See which challenge and innovation type pairs are proven in the field"
          onPress={onOpenReadyHeatmap}
        />
      )}

      <AppText style={styles.sectionHeader}>INNOVATION HUBS</AppText>
      <View style={styles.pillsWrap}>
        {explore.topRegions.map((region) => (
          <TouchableOpacity
            key={region.id}
            style={styles.pillCountry}
            onPress={() => onOpenDrilldown(regionTarget(region))}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <AppText style={styles.pillTextCountry} numberOfLines={1}>{region.name}</AppText>
            <AppText style={styles.pillCount}>{region.count}</AppText>
          </TouchableOpacity>
        ))}
      </View>

      {online && (
        <InsightCard
          icon="grid-outline"
          iconColor={COLORS.accent}
          tint={COLORS.accentTint}
          title="Adoption Opportunities"
          body="Find regions where proven innovations are not yet reaching farmers"
          onPress={onOpenOpportunityHeatmap}
        />
      )}

      <AppText style={styles.sectionHeader}>MOST FIELD-TESTED</AppText>
      {explore.mostAdvanced.map((innovation) => (
        <View key={innovation.id}>{renderCard(innovation)}</View>
      ))}

      <TouchableOpacity
        style={styles.browseAllBtn}
        onPress={() => onOpenDrilldown(allTarget())}
        accessibilityRole="button"
      >
        <AppText style={styles.browseAllText}>
          Browse All {explore.stats.innovations.toLocaleString()} Innovations →
        </AppText>
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function Stat({ value, label, bordered }) {
  return (
    <View style={[styles.statItem, bordered && styles.statBorder]}>
      <AppText style={styles.statNum}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

/** A full-width link into one of the heat maps, in that map's own colour. */
function InsightCard({ icon, iconColor, tint, title, body, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.insightCard, { backgroundColor: tint }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${body}`}
    >
      <View style={styles.insightIcon}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.insightText}>
        <AppText style={styles.insightTitle}>{title}</AppText>
        <AppText style={styles.insightBody}>{body}</AppText>
      </View>
      <Icon name="chevron-forward" size={16} color={COLORS.textHeading} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // The same two styles as the note on the drilldowns and in search, because
  // they mean the same thing.
  offlineNote: {
    backgroundColor: COLORS.surfaceSunken,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineNoteText: { fontSize: 12, color: COLORS.textBody },
  scrollView: { flex: 1, paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: COLORS.textMuted, fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textHeading, marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 13, color: COLORS.textBody, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: COLORS.textInverse, fontWeight: '600', fontSize: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden', marginTop: 16 },
  statItem: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border },
  statNum: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.3, marginTop: 4 },
  sectionHeader: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '48%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gridItemText: { flex: 1 },
  gridName: { fontSize: 12, fontWeight: '600' },
  gridSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pillCountry: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillTextCountry: { fontSize: 11, fontWeight: '500' },
  pillCount: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.md, padding: 14, marginTop: 12 },
  insightIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  insightText: { flex: 1 },
  insightTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textHeading },
  insightBody: { fontSize: 11, color: COLORS.textBody, marginTop: 2, lineHeight: 15 },
  browseAllBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: 16, alignItems: 'center', marginTop: 20 },
  browseAllText: { fontSize: 14, color: COLORS.textInverse, fontWeight: '600' },
  bottomSpacer: { height: 100 },
});
