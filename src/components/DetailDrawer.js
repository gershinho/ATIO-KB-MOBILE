import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  StyleSheet, View, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, Animated, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './icons/Icon';
import {
  READINESS_LEVELS, ADOPTION_LEVELS, SDGS, costLevel, complexityLevel,
} from '../data/constants';
import { AccessibilityContext } from '../context/AccessibilityContext';
import { useDownloadIndicator } from '../context/DownloadContext';
import useInnovationBullets from '../hooks/useInnovationBullets';
import AppText from './AppText';
import { COLORS, RADIUS } from '../theme/fao';

/** Shown when a derived cost or complexity is absent or outside its known set. */
const UNKNOWN_LEVEL = { label: '—', color: COLORS.textMuted, background: COLORS.surfaceMuted };


/**
 * Title, type/grassroots, countries and the downloaded stamp.
 *
 * The collapsed preview and the expanded sheet rendered these ~24 lines twice,
 * differing only in whether the country line truncates.
 */
function RecordHeader({ innovation, countriesDisplay, downloadedAt, compact }) {
  return (
    <>
      <View style={styles.titleRow}>
        <AppText style={styles.title}>{innovation.title}</AppText>
      </View>
      <View style={styles.metaRow}>
        <AppText style={styles.typeText}>{innovation.types?.[0] || ''}</AppText>
        {innovation.isGrassroots && (
          <View style={styles.grassrootsBadge}>
            <Icon name="leaf-outline" size={12} color={COLORS.eco} style={{ marginRight: 4 }} />
            <AppText style={styles.grassrootsText}>Grassroots</AppText>
          </View>
        )}
      </View>
      <View style={styles.countryRow}>
        <Icon name="location-outline" size={14} color={COLORS.textMuted} />
        <AppText style={styles.countryText} numberOfLines={compact ? 1 : undefined}>
          {compact ? countriesDisplay : innovation.countries?.join(', ') || innovation.region}
        </AppText>
      </View>
      {downloadedAt != null && (
        <View style={styles.downloadedRow}>
          <Icon name="download-outline" size={14} color={COLORS.textBody} />
          <AppText style={styles.downloadedText}>
            Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </AppText>
        </View>
      )}
    </>
  );
}

/**
 * The full record view, as a bottom sheet.
 *
 * Takes the record plus callbacks, and reads everything that belongs to the
 * record off the record — the same contract InnovationCard already uses. It
 * previously declared thumbsUpCount, commentCount and downloadedAt as separate
 * props *alongside* the `innovation` they are fields of, and isBookmarked/isLiked
 * as booleans rather than the id lookups they are, so all three call sites spent
 * five null-guarding ternaries each restating values this component could
 * derive. The two components that render the same record now agree on how they
 * take it.
 *
 * @param {object} innovation - the record; title, countries, descriptions, the
 *   two counts and downloadedAt are all read from it
 * @param {boolean} visible
 * @param {() => void} onClose
 * @param {boolean} [startExpanded] - open at full height rather than as a preview
 * @param {(id: number|string) => boolean} [isBookmarked] - lookup, not a boolean
 * @param {(id: number|string) => boolean} [isLiked] - lookup, not a boolean
 * @param {(innovation: object) => void} [onBookmark] - absent hides the control
 * @param {(innovation: object) => void} [onDownload] - absent hides the control
 * @param {(innovation: object) => void} [onThumbsUp] - absent hides the control
 * @param {(innovation: object) => void} [onComments] - absent hides the control
 * @param {boolean} [hideDownloadInHeader] - the Downloads tab already shows it
 */
export default function DetailDrawer({
  innovation,
  visible,
  onClose,
  isBookmarked,
  onBookmark,
  onDownload,
  startExpanded,
  onComments,
  onThumbsUp,
  isLiked,
  hideDownloadInHeader = false,
}) {
  const insets = useSafeAreaInsets();
  // Read at render rather than frozen at import, so the drawer is sized
  // correctly after a rotation.
  const { height: screenHeight } = useWindowDimensions();
  const { reduceMotion } = useContext(AccessibilityContext);
  const { isDownloadActive, drainAnim } = useDownloadIndicator(innovation?.id);
  const [expanded, setExpanded] = useState(false);
  const [selectedSdg, setSelectedSdg] = useState(null);
  const { bullets, loading: bulletsLoading } = useInnovationBullets(innovation, visible);

  // Derived from the record rather than restated by every call site.
  const thumbsUpCount = innovation?.thumbsUpCount ?? 0;
  const commentCount = innovation?.commentCount ?? 0;
  const downloadedAt = innovation?.downloadedAt ?? null;
  const bookmarked = innovation ? !!isBookmarked?.(innovation.id) : false;
  const liked = innovation ? !!isLiked?.(innovation.id) : false;

  useEffect(() => {
    if (visible && innovation) {
      setExpanded(!!startExpanded);
    }
    // Keyed on the innovation's id rather than the object: callers rebuild the
    // object on every render (the count overlay returns a fresh one after a
    // like), and re-collapsing the drawer because a number changed would be a bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [visible, innovation?.id, startExpanded]);

  // The scrim and the sheet move independently, and deliberately.
  //
  // This used to be <Modal animationType="slide">, which slides the modal's
  // whole subtree — and the scrim lives in that subtree, so the dark tint flew
  // up from the bottom of the screen with the sheet instead of settling over
  // the page. The sheet still slides; the scrim now only fades, in place.
  const sheetAnim = useRef(new Animated.Value(1)).current; // 1 = fully offscreen

  useEffect(() => {
    if (!visible) {
      // Reset so the next open starts from offscreen rather than mid-flight.
      sheetAnim.setValue(1);
      return;
    }
    if (reduceMotion) {
      sheetAnim.setValue(0);
      return;
    }
    Animated.spring(sheetAnim, {
      toValue: 0,
      damping: 26,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, sheetAnim]);

  if (!innovation || !visible) return null;

  const readiness = READINESS_LEVELS.find(r => r.level === innovation.readinessLevel) || READINESS_LEVELS[0];
  const adoption = ADOPTION_LEVELS.find(a => a.level === innovation.adoptionLevel) || ADOPTION_LEVELS[0];
  // An unrecognised value shows as "—" rather than being labelled "Moderate",
  // which is what the three inline copies of this mapping all used to do.
  const cost = costLevel(innovation.cost) ?? UNKNOWN_LEVEL;
  const complexity = complexityLevel(innovation.complexity) ?? UNKNOWN_LEVEL;

  const countriesList = innovation.countries || [];
  const countriesDisplay = countriesList.length <= 2
    ? (countriesList.join(', ') || innovation.region)
    : countriesList.slice(0, 2).join(', ') + ' +' + (countriesList.length - 2);

  const availableHeight = screenHeight - insets.top;
  const previewHeight = Math.min(availableHeight * 0.45, screenHeight * 0.45);
  const drawerHeight = expanded ? availableHeight : previewHeight;

  const handleToggle = () => setExpanded(!expanded);
  // No guard needed: the component returns null without an innovation, and the
  // button that calls this only renders when onThumbsUp is set.
  const handleThumbsUp = () => onThumbsUp(innovation);
  const handleSdgPress = (num) => setSelectedSdg(selectedSdg === num ? null : num);
  const sdgInfo = selectedSdg ? SDGS.find(s => s.number === selectedSdg) : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/*
          Fades in place, never moves. Its opacity is derived from the sheet's
          own value rather than animated separately: a second Animated.timing
          on opacity did not interpolate on web under either driver — it jumped
          to 1 in a single frame — while this spring animates correctly, so
          reading from it gives one animation and one source of truth. Clamped
          because the spring overshoots slightly past 0.
          pointerEvents="none" so taps reach the closer below.
        */}
        <Animated.View
          style={[styles.scrim, {
            opacity: sheetAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }]}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={styles.overlayTouch}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close details"
        />
        <Animated.View
          style={[
            styles.drawer,
            {
              height: drawerHeight,
              transform: [{
                translateY: sheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, drawerHeight],
                }),
              }],
            },
          ]}
        >
          <TouchableOpacity
            onPress={expanded ? onClose : handleToggle}
            style={styles.handleWrap}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Close details' : 'Show full details'}
          >
            <View style={styles.handle} />
          </TouchableOpacity>
          {expanded && (
            <View style={styles.header}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Icon name="arrow-back" size={24} color={COLORS.textBody} />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {onBookmark && (
                <TouchableOpacity
                  style={[styles.actionBtn, bookmarked && styles.actionBtnBookmarked]}
                  onPress={() => onBookmark(innovation)}
                  accessibilityRole="button"
                  accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark this solution'}
                  accessibilityState={{ selected: bookmarked }}
                >
                  <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={bookmarked ? '#fff' : COLORS.textBody} />
                </TouchableOpacity>
              )}
              {onComments && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onComments(innovation)}
                  accessibilityRole="button"
                  accessibilityLabel={`Comments, ${commentCount}`}
                >
                  <View style={styles.thumbsUpWrap}>
                    <Icon name="chatbubble-ellipses-outline" size={22} color={COLORS.textBody} />
                    <AppText style={styles.thumbsUpCount}>{commentCount}</AppText>
                  </View>
                </TouchableOpacity>
              )}
              {onDownload && !hideDownloadInHeader && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onDownload(innovation)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Download this solution"
                >
                  <View style={styles.actionBtnDownloadWrap}>
                    {isDownloadActive && (
                      <Animated.View
                        style={[
                          styles.actionBtnDownloadFill,
                          {
                            height: drainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 38] }),
                          },
                        ]}
                      />
                    )}
                    <Icon name="download-outline" size={22} color={isDownloadActive ? COLORS.primary : COLORS.textBody} style={styles.actionBtnDownloadIcon} />
                  </View>
                </TouchableOpacity>
              )}
              {onThumbsUp && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleThumbsUp}
                  accessibilityRole="button"
                  accessibilityLabel={
                    liked ? `Remove your like, ${thumbsUpCount}` : `Like this solution, ${thumbsUpCount}`
                  }
                  accessibilityState={{ selected: liked }}
                >
                  <View style={styles.thumbsUpWrap}>
                    <Icon
                      name={liked ? 'thumbs-up' : 'thumbs-up-outline'}
                      size={22}
                      color={liked ? COLORS.primary : COLORS.textBody}
                    />
                    <AppText style={styles.thumbsUpCount}>{thumbsUpCount}</AppText>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!expanded ? (
            <View style={styles.previewWrap}>
              <View style={styles.previewHeader}>
                <RecordHeader
                  innovation={innovation}
                  countriesDisplay={countriesDisplay}
                  downloadedAt={downloadedAt}
                  compact
                />
              </View>
              <ScrollView
                style={styles.previewDescScroll}
                contentContainerStyle={styles.previewDescContent}
                showsVerticalScrollIndicator
                bounces
              >
                {bulletsLoading ? (
                  <View style={styles.bulletsLoaderWrap}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : bullets && bullets.length > 0 ? (
                  <View style={styles.bulletsWrap}>
                    {bullets.map((line, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <AppText style={styles.bulletText}>{line}</AppText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <AppText style={styles.descPreview}>
                    {innovation.shortDescription || innovation.longDescription}
                  </AppText>
                )}
              </ScrollView>
              <View style={[styles.previewBtnWrap, { paddingBottom: 16 + insets.bottom }]}>
                <TouchableOpacity
                  style={styles.viewMoreBtn}
                  onPress={handleToggle}
                  accessibilityRole="button"
                  accessibilityLabel="Show full details"
                >
                  <AppText style={styles.viewMoreText}>View More</AppText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
            showsVerticalScrollIndicator
            bounces
          >
            <View style={styles.body}>
              <RecordHeader
                innovation={innovation}
                countriesDisplay={countriesDisplay}
                downloadedAt={downloadedAt}
              />
                  <AppText style={styles.sectionTitle}>Overview</AppText>
                  <View style={styles.descFixedWrap}>
                    <ScrollView
                      style={styles.descFixedScroll}
                      contentContainerStyle={styles.descFixedContent}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                    >
                      <AppText style={styles.descFull}>
                        {innovation.shortDescription || innovation.longDescription || ''}
                      </AppText>
                    </ScrollView>
                  </View>
                  <View style={styles.progSection}>
                    <View style={styles.progItem}>
                      <View style={styles.progHead}>
                        <AppText style={styles.progLabel}>Readiness Level</AppText>
                        <AppText style={styles.progVal}>{readiness.name}</AppText>
                      </View>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${(innovation.readinessLevel / 9) * 100}%`, backgroundColor: COLORS.primary }]} />
                      </View>
                    </View>
                    <View style={styles.progItem}>
                      <View style={styles.progHead}>
                        <AppText style={styles.progLabel}>Adoption Level</AppText>
                        <AppText style={styles.progVal}>{adoption.name}</AppText>
                      </View>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${(innovation.adoptionLevel / 9) * 100}%`, backgroundColor: COLORS.primary }]} />
                      </View>
                    </View>
                  </View>
                  <AppText style={styles.sectionTitle}>Cost & Complexity</AppText>
                  <View style={styles.chipRow}>
                    <View style={[styles.costChip, { backgroundColor: cost.background }]}>
                      <AppText style={[styles.costChipText, { color: cost.color }]}>{cost.label}</AppText>
                    </View>
                    <View style={[styles.costChip, { backgroundColor: complexity.background }]}>
                      <AppText style={[styles.costChipText, { color: complexity.color }]}>{complexity.label}</AppText>
                    </View>
                  </View>
                  <AppText style={styles.costComplexityDisclaimer}>May have inaccuracies</AppText>
                  {innovation.useCases?.length > 0 && (
                    <>
                      <AppText style={styles.sectionTitle}>Primary Use Cases</AppText>
                      <View style={styles.chipRow}>
                        {innovation.useCases.slice(0, 6).map((uc, i) => (
                          <View key={i} style={styles.useChip}>
                            <AppText style={styles.useChipText}>{uc}</AppText>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                  {innovation.users?.length > 0 && (
                    <>
                      <AppText style={styles.sectionTitle}>Intended User Groups</AppText>
                      {innovation.users.slice(0, 5).map((u, i) => (
                        <View key={i} style={styles.userItem}>
                          <View style={styles.userDot} />
                          <AppText style={styles.userText}>{u}</AppText>
                        </View>
                      ))}
                    </>
                  )}
                  <AppText style={styles.sectionTitle}>Key Benefits</AppText>
                  <View style={styles.benefitItem}>
                    <View style={[styles.benefitDot, { backgroundColor: COLORS.primary }]} />
                    <AppText style={styles.benefitText}>Readiness: {readiness.name} — {readiness.description}</AppText>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={[styles.benefitDot, { backgroundColor: COLORS.primary }]} />
                    <AppText style={styles.benefitText}>Adoption: {adoption.name} — {adoption.description}</AppText>
                  </View>
                  {innovation.cost === 'low' && (
                    <View style={styles.benefitItem}>
                      <View style={[styles.benefitDot, { backgroundColor: COLORS.primary }]} />
                      <AppText style={styles.benefitText}>Low cost — accessible to resource-constrained users</AppText>
                    </View>
                  )}
                  <AppText style={styles.sectionTitle}>Source & Adoption</AppText>
                  <AppText style={styles.sourceText}>
                    {innovation.dataSource} — {innovation.owner || innovation.partner || 'Multiple partners'}
                  </AppText>
                  {innovation.sdgs?.length > 0 && (
                    <>
                      <AppText style={styles.sectionTitle}>SDG Alignment</AppText>
                      <View style={styles.sdgGrid}>
                        {innovation.sdgs.map(num => {
                          const sdg = SDGS.find(s => s.number === num);
                          if (!sdg) return null;
                          return (
                            <TouchableOpacity
                              key={num}
                              style={[styles.sdgBox, { backgroundColor: sdg.color }, selectedSdg === num && styles.sdgBoxActive]}
                              onPress={() => handleSdgPress(num)}
                            >
                              <AppText style={styles.sdgBoxText}>{num}</AppText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {sdgInfo && (
                        <View style={styles.sdgPopup}>
                          <AppText style={[styles.sdgPopupTitle, { color: sdgInfo.color }]}>SDG {sdgInfo.number}: {sdgInfo.name}</AppText>
                          <AppText style={styles.sdgPopupDesc}>{sdgInfo.description}</AppText>
                        </View>
                      )}
                    </>
                  )}
                  <View style={{ height: 24 }} />
            </View>
          </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.scrim },
  overlayTouch: { flex: 1 },
  drawer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 200,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 14 },
  handle: { width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  actionBtn: { padding: 8 },
  actionBtnBookmarked: { backgroundColor: COLORS.primary, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 0 },
  actionBtnDownloadWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  actionBtnDownloadFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 38, backgroundColor: COLORS.primaryLight, borderRadius: 19 },
  actionBtnDownloadIcon: { zIndex: 1 },
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpCount: { fontSize: 10, color: COLORS.textBody },
  previewWrap: { flex: 1, minHeight: 0 },
  previewHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  previewDescScroll: { flex: 1, minHeight: 0 },
  previewDescContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  bulletsLoaderWrap: { paddingVertical: 24, alignItems: 'center' },
  bulletsWrap: { marginTop: -6 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 7, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 13, color: COLORS.textBody, lineHeight: 20 },
  previewBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
  body: { padding: 16, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  leafBadge: { width: 20, height: 20, backgroundColor: COLORS.primaryLight, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', flex: 1, color: COLORS.textHeading },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeText: { fontSize: 12, color: COLORS.textMuted },
  grassrootsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  grassrootsText: { fontSize: 10, fontWeight: '600', color: COLORS.eco },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  countryText: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  downloadedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  downloadedText: { fontSize: 12, color: COLORS.textBody },
  descPreview: { fontSize: 13, color: COLORS.textBody, lineHeight: 20 },
  viewMoreBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
  viewMoreText: { color: COLORS.textInverse, fontWeight: '600', fontSize: 13 },
  descFull: { fontSize: 13, color: COLORS.textBody, lineHeight: 20, paddingBottom: 8 },
  descFixedWrap: { height: 200, marginBottom: 14 },
  descFixedScroll: { flex: 1 },
  descFixedContent: { paddingRight: 4, paddingBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textHeading, marginBottom: 8, marginTop: 14 },
  progSection: { marginBottom: 4 },
  progItem: { marginBottom: 10 },
  progHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progLabel: { fontWeight: '600', fontSize: 11, color: COLORS.textHeading },
  progVal: { fontSize: 10, color: COLORS.textMuted, maxWidth: '50%', textAlign: 'right' },
  progBar: { width: '100%', height: 6, backgroundColor: COLORS.border, borderRadius: 3 },
  progFill: { height: 6, borderRadius: 3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  costChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  costChipText: { fontSize: 12, fontWeight: '600' },
  costComplexityDisclaimer: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, marginBottom: 4 },
  useChip: { backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  useChipText: { fontSize: 11, color: COLORS.textBody },
  userItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceMuted },
  userDot: { width: 4, height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },
  userText: { fontSize: 12, color: COLORS.textBody },
  benefitItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceMuted },
  benefitDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  benefitText: { fontSize: 12, color: COLORS.textBody, flex: 1, lineHeight: 18 },
  sourceText: { fontSize: 12, color: COLORS.textBody, lineHeight: 18, marginBottom: 12 },
  sdgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sdgBox: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  sdgBoxActive: { borderColor: COLORS.textHeading, transform: [{ scale: 1.05 }] },
  sdgBoxText: { color: COLORS.textInverse, fontSize: 14, fontWeight: '700' },
  sdgPopup: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, marginTop: 4, shadowColor: COLORS.textHeading, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sdgPopupTitle: { fontWeight: '700', fontSize: 12, marginBottom: 4 },
  sdgPopupDesc: { fontSize: 11, color: COLORS.textBody, lineHeight: 16 },
});
