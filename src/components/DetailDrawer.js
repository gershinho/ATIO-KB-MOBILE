import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet, View, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, Animated, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  READINESS_LEVELS, ADOPTION_LEVELS, SDGS, costLevel, complexityLevel,
} from '../data/constants';
import { summarizeBullets } from '../services/api';
import { getCachedBullets, setCachedBullets } from '../database/db';
import { AccessibilityContext } from '../context/AccessibilityContext';
import { useDownloadIndicator } from '../context/DownloadContext';
import { createLogger } from '../utils/logger';
import AppText from './AppText';

const log = createLogger('detail drawer');

/** Shown when a derived cost or complexity is absent or outside its known set. */
const UNKNOWN_LEVEL = { label: '—', color: '#6b7280', background: '#f3f4f6' };

export default function DetailDrawer({
  innovation,
  visible,
  onClose,
  isBookmarked,
  onBookmark,
  onDownload,
  startExpanded,
  downloadedAt,
  onComments,
  thumbsUpCount = 0,
  onThumbsUp,
  isLiked = false,
  commentCount = 0,
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
  const [bullets, setBullets] = useState(null);
  const [bulletsLoading, setBulletsLoading] = useState(false);

  useEffect(() => {
    if (visible && innovation) {
      setExpanded(!!startExpanded);
    }
    // Keyed on the innovation's id rather than the object: callers rebuild the
    // object on every render (the count overlay returns a fresh one after a
    // like), and re-collapsing the drawer because a number changed would be a bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [visible, innovation?.id, startExpanded]);

  // Only call AI when user opens this drawer (Learn more). Uses cache so each innovation is summarized at most once.
  useEffect(() => {
    if (!visible || !innovation) return;
    setBullets(null);
    setBulletsLoading(false);
    // Send only description text to the API — no metadata (title, cost, region, etc.)
    const parts = [innovation.shortDescription, innovation.longDescription].filter(Boolean);
    const text = parts.join('\n\n').trim();
    if (!text) return;

    let cancelled = false;
    (async () => {
      const cached = await getCachedBullets(innovation.id);
      if (cancelled) return;
      // Array.isArray already excludes null and undefined.
      if (Array.isArray(cached) && cached.length === 3) {
        setBullets(cached);
        return;
      }
      setBulletsLoading(true);
      try {
        const fetched = await summarizeBullets(text, innovation.id);
        if (cancelled) return;
        if (fetched) {
          await setCachedBullets(innovation.id, fetched);
          if (!cancelled) setBullets(fetched);
        }
      } catch (err) {
        // Bullets are an enhancement over the raw description, so a failure is
        // not worth interrupting the user for — but it should not vanish either.
        log.degraded('Bullet summary unavailable; showing the raw description:', err.message);
      } finally {
        if (!cancelled) setBulletsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Same reasoning: the description text this reads is fixed for a given id,
    // so re-summarising because a thumbs-up count changed would be a wasted
    // AI call.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [innovation?.id, visible]);

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
  const handleThumbsUp = () => {
    if (onThumbsUp && innovation) {
      onThumbsUp(innovation);
    }
  };
  const handleSdgPress = (num) => setSelectedSdg(selectedSdg === num ? null : num);
  const sdgInfo = selectedSdg ? SDGS.find(s => s.number === selectedSdg) : null;

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouch} onPress={onClose} activeOpacity={1} />
        <View style={[styles.drawer, { height: drawerHeight }]}>
          <TouchableOpacity onPress={expanded ? onClose : handleToggle} style={styles.handleWrap}>
            <View style={styles.handle} />
          </TouchableOpacity>
          {expanded && (
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#555" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {onBookmark && (
                <TouchableOpacity style={[styles.actionBtn, isBookmarked && styles.actionBtnBookmarked]} onPress={() => onBookmark(innovation)}>
                  <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={isBookmarked ? '#fff' : '#333'} />
                </TouchableOpacity>
              )}
              {onComments && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => onComments(innovation)}>
                  <View style={styles.thumbsUpWrap}>
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color="#333" />
                    <AppText style={styles.thumbsUpCount}>{commentCount}</AppText>
                  </View>
                </TouchableOpacity>
              )}
              {onDownload && !hideDownloadInHeader && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => onDownload(innovation)} activeOpacity={0.7}>
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
                    <Ionicons name="download-outline" size={22} color={isDownloadActive ? '#22c55e' : '#333'} style={styles.actionBtnDownloadIcon} />
                  </View>
                </TouchableOpacity>
              )}
              {onThumbsUp != null && (
                <TouchableOpacity style={styles.actionBtn} onPress={handleThumbsUp}>
                  <View style={styles.thumbsUpWrap}>
                    <Ionicons
                      name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                      size={22}
                      color={isLiked ? '#22c55e' : '#333'}
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
                <View style={styles.titleRow}>
                  <AppText style={styles.title}>{innovation.title}</AppText>
                </View>
                <View style={styles.metaRow}>
                  <AppText style={styles.typeText}>{innovation.types?.[0] || ''}</AppText>
                  {innovation.isGrassroots && (
                    <View style={styles.grassrootsBadge}>
                      <Ionicons name="leaf-outline" size={12} color="#16a34a" style={{ marginRight: 4 }} />
                      <AppText style={styles.grassrootsText}>Grassroots</AppText>
                    </View>
                  )}
                </View>
                <View style={styles.countryRow}>
                  <Ionicons name="location-outline" size={14} color="#999" />
                  <AppText style={styles.countryText} numberOfLines={1}>{countriesDisplay}</AppText>
                </View>
                {downloadedAt != null && (
                  <View style={styles.downloadedRow}>
                    <Ionicons name="download-outline" size={14} color="#666" />
                    <AppText style={styles.downloadedText}>
                      Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </AppText>
                  </View>
                )}
              </View>
              <ScrollView
                style={styles.previewDescScroll}
                contentContainerStyle={styles.previewDescContent}
                showsVerticalScrollIndicator
                bounces
              >
                {bulletsLoading ? (
                  <View style={styles.bulletsLoaderWrap}>
                    <ActivityIndicator size="small" color="#22c55e" />
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
                <TouchableOpacity style={styles.viewMoreBtn} onPress={handleToggle}>
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
              <View style={styles.titleRow}>
                <AppText style={styles.title}>{innovation.title}</AppText>
              </View>
              <View style={styles.metaRow}>
                <AppText style={styles.typeText}>{innovation.types?.[0] || ''}</AppText>
                {innovation.isGrassroots && (
                  <View style={styles.grassrootsBadge}>
                    <Ionicons name="leaf-outline" size={12} color="#16a34a" style={{ marginRight: 4 }} />
                    <AppText style={styles.grassrootsText}>Grassroots</AppText>
                  </View>
                )}
              </View>
              <View style={styles.countryRow}>
                <Ionicons name="location-outline" size={14} color="#999" />
                <AppText style={styles.countryText}>{innovation.countries?.join(', ') || innovation.region}</AppText>
              </View>
              {downloadedAt != null && (
                <View style={styles.downloadedRow}>
                  <Ionicons name="download-outline" size={14} color="#666" />
                  <AppText style={styles.downloadedText}>
                    Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </AppText>
                </View>
              )}
                <>
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
                        <View style={[styles.progFill, { width: `${(innovation.readinessLevel / 9) * 100}%`, backgroundColor: '#22c55e' }]} />
                      </View>
                    </View>
                    <View style={styles.progItem}>
                      <View style={styles.progHead}>
                        <AppText style={styles.progLabel}>Adoption Level</AppText>
                        <AppText style={styles.progVal}>{adoption.name}</AppText>
                      </View>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${(innovation.adoptionLevel / 9) * 100}%`, backgroundColor: '#3b82f6' }]} />
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
                    <View style={[styles.benefitDot, { backgroundColor: '#22c55e' }]} />
                    <AppText style={styles.benefitText}>Readiness: {readiness.name} — {readiness.description}</AppText>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={[styles.benefitDot, { backgroundColor: '#3b82f6' }]} />
                    <AppText style={styles.benefitText}>Adoption: {adoption.name} — {adoption.description}</AppText>
                  </View>
                  {innovation.cost === 'low' && (
                    <View style={styles.benefitItem}>
                      <View style={[styles.benefitDot, { backgroundColor: '#22c55e' }]} />
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
                </>
            </View>
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  overlayTouch: { flex: 1 },
  drawer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 200,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 14 },
  handle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  actionBtn: { padding: 8 },
  actionBtnBookmarked: { backgroundColor: '#2563eb', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 0 },
  actionBtnDownloadWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  actionBtnDownloadFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 38, backgroundColor: '#dcfce7', borderRadius: 19 },
  actionBtnDownloadIcon: { zIndex: 1 },
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpCount: { fontSize: 10, color: '#666' },
  previewWrap: { flex: 1, minHeight: 0 },
  previewHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  previewDescScroll: { flex: 1, minHeight: 0 },
  previewDescContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  bulletsLoaderWrap: { paddingVertical: 24, alignItems: 'center' },
  bulletsWrap: { marginTop: -6 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginTop: 7, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 20 },
  previewBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
  body: { padding: 16, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  leafBadge: { width: 20, height: 20, backgroundColor: '#dcfce7', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', flex: 1, color: '#111' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeText: { fontSize: 12, color: '#999' },
  grassrootsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  grassrootsText: { fontSize: 10, fontWeight: '600', color: '#16a34a' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  countryText: { fontSize: 12, color: '#999', flex: 1 },
  downloadedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  downloadedText: { fontSize: 12, color: '#666' },
  descPreview: { fontSize: 13, color: '#555', lineHeight: 20 },
  viewMoreBtn: { backgroundColor: '#030213', borderRadius: 12, padding: 14, alignItems: 'center' },
  viewMoreText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  descFull: { fontSize: 13, color: '#555', lineHeight: 20, paddingBottom: 8 },
  descFixedWrap: { height: 200, marginBottom: 14 },
  descFixedScroll: { flex: 1 },
  descFixedContent: { paddingRight: 4, paddingBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 8, marginTop: 14 },
  progSection: { marginBottom: 4 },
  progItem: { marginBottom: 10 },
  progHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progLabel: { fontWeight: '600', fontSize: 11, color: '#111' },
  progVal: { fontSize: 10, color: '#999', maxWidth: '50%', textAlign: 'right' },
  progBar: { width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  progFill: { height: 6, borderRadius: 3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  costChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  costChipText: { fontSize: 12, fontWeight: '600' },
  costComplexityDisclaimer: { fontSize: 10, color: '#999', marginTop: 2, marginBottom: 4 },
  useChip: { backgroundColor: '#f3f3f3', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  useChipText: { fontSize: 11, color: '#555' },
  userItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  userDot: { width: 4, height: 4, backgroundColor: '#22c55e', borderRadius: 2 },
  userText: { fontSize: 12, color: '#555' },
  benefitItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  benefitDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  benefitText: { fontSize: 12, color: '#555', flex: 1, lineHeight: 18 },
  sourceText: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 12 },
  sdgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sdgBox: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  sdgBoxActive: { borderColor: '#030213', transform: [{ scale: 1.05 }] },
  sdgBoxText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sdgPopup: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sdgPopupTitle: { fontWeight: '700', fontSize: 12, marginBottom: 4 },
  sdgPopupDesc: { fontSize: 11, color: '#555', lineHeight: 16 },
});
