import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Modal, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../data/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
}) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [selectedSdg, setSelectedSdg] = useState(null);

  useEffect(() => {
    if (visible && innovation) {
      setExpanded(!!startExpanded);
    }
  }, [visible, innovation?.id, startExpanded, thumbsUpCount]);

  if (!innovation || !visible) return null;

  const readiness = READINESS_LEVELS.find(r => r.level === innovation.readinessLevel) || READINESS_LEVELS[0];
  const adoption = ADOPTION_LEVELS.find(a => a.level === innovation.adoptionLevel) || ADOPTION_LEVELS[0];
  const costLabel = innovation.cost === 'low' ? '$ Low / Free' : innovation.cost === 'high' ? '$$$ High' : '$$ Moderate';
  const costColor = innovation.cost === 'low' ? '#0369a1' : innovation.cost === 'high' ? '#dc2626' : '#d97706';
  const costBg = innovation.cost === 'low' ? '#f0f9ff' : innovation.cost === 'high' ? '#fef2f2' : '#fffbeb';
  const complexLabel = innovation.complexity ? innovation.complexity.charAt(0).toUpperCase() + innovation.complexity.slice(1) : 'Moderate';
  const complexColor = innovation.complexity === 'simple' ? '#16a34a' : innovation.complexity === 'advanced' ? '#7e22ce' : '#d97706';
  const complexBg = innovation.complexity === 'simple' ? '#f0fdf4' : innovation.complexity === 'advanced' ? '#fdf4ff' : '#fffbeb';

  const availableHeight = SCREEN_HEIGHT - insets.top;
  const previewHeight = Math.min(availableHeight * 0.45, SCREEN_HEIGHT * 0.45);
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
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
                    <Text style={styles.thumbsUpCount}>{commentCount}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {onDownload && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => onDownload(innovation)}>
                  <Ionicons name="download-outline" size={22} color="#333" />
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
                    <Text style={styles.thumbsUpCount}>{thumbsUpCount}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!expanded ? (
            <View style={styles.previewWrap}>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{innovation.title}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.typeText}>{innovation.types?.[0] || ''}</Text>
                  {innovation.isGrassroots && (
                    <View style={styles.grassrootsBadge}>
                      <Ionicons name="leaf-outline" size={12} color="#16a34a" style={{ marginRight: 4 }} />
                      <Text style={styles.grassrootsText}>Grassroots</Text>
                    </View>
                  )}
                </View>
                <View style={styles.countryRow}>
                  <Ionicons name="location-outline" size={14} color="#999" />
                  <Text style={styles.countryText}>{innovation.countries?.join(', ') || innovation.region}</Text>
                </View>
                {downloadedAt != null && (
                  <View style={styles.downloadedRow}>
                    <Ionicons name="download-outline" size={14} color="#666" />
                    <Text style={styles.downloadedText}>
                      Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </View>
                )}
              </View>
              <ScrollView
                style={styles.previewDescScroll}
                contentContainerStyle={styles.previewDescContent}
                showsVerticalScrollIndicator
                bounces
              >
                <Text style={styles.descPreview}>
                  {innovation.shortDescription || innovation.longDescription}
                </Text>
              </ScrollView>
              <View style={[styles.previewBtnWrap, { paddingBottom: 16 + insets.bottom }]}>
                <TouchableOpacity style={styles.viewMoreBtn} onPress={handleToggle}>
                  <Text style={styles.viewMoreText}>View More</Text>
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
                <Text style={styles.title}>{innovation.title}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.typeText}>{innovation.types?.[0] || ''}</Text>
                {innovation.isGrassroots && (
                  <View style={styles.grassrootsBadge}>
                    <Ionicons name="leaf-outline" size={12} color="#16a34a" style={{ marginRight: 4 }} />
                    <Text style={styles.grassrootsText}>Grassroots</Text>
                  </View>
                )}
              </View>
              <View style={styles.countryRow}>
                <Ionicons name="location-outline" size={14} color="#999" />
                <Text style={styles.countryText}>{innovation.countries?.join(', ') || innovation.region}</Text>
              </View>
              {downloadedAt != null && (
                <View style={styles.downloadedRow}>
                  <Ionicons name="download-outline" size={14} color="#666" />
                  <Text style={styles.downloadedText}>
                    Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </View>
              )}
                <>
                  <Text style={styles.sectionTitle}>Overview</Text>
                  <View style={styles.descFixedWrap}>
                    <ScrollView
                      style={styles.descFixedScroll}
                      contentContainerStyle={styles.descFixedContent}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                    >
                      <Text style={styles.descFull}>
                        {innovation.shortDescription || innovation.longDescription || ''}
                      </Text>
                    </ScrollView>
                  </View>
                  <View style={styles.progSection}>
                    <View style={styles.progItem}>
                      <View style={styles.progHead}>
                        <Text style={styles.progLabel}>Readiness Level</Text>
                        <Text style={styles.progVal}>{readiness.name}</Text>
                      </View>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${(innovation.readinessLevel / 9) * 100}%`, backgroundColor: '#22c55e' }]} />
                      </View>
                    </View>
                    <View style={styles.progItem}>
                      <View style={styles.progHead}>
                        <Text style={styles.progLabel}>Adoption Level</Text>
                        <Text style={styles.progVal}>{adoption.name}</Text>
                      </View>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${(innovation.adoptionLevel / 9) * 100}%`, backgroundColor: '#3b82f6' }]} />
                      </View>
                    </View>
                  </View>
                  <Text style={styles.sectionTitle}>Cost & Complexity</Text>
                  <View style={styles.chipRow}>
                    <View style={[styles.costChip, { backgroundColor: costBg }]}>
                      <Text style={[styles.costChipText, { color: costColor }]}>{costLabel}</Text>
                    </View>
                    <View style={[styles.costChip, { backgroundColor: complexBg }]}>
                      <Text style={[styles.costChipText, { color: complexColor }]}>{complexLabel}</Text>
                    </View>
                  </View>
                  {innovation.useCases?.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>Primary Use Cases</Text>
                      <View style={styles.chipRow}>
                        {innovation.useCases.slice(0, 6).map((uc, i) => (
                          <View key={i} style={styles.useChip}>
                            <Text style={styles.useChipText}>{uc}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                  {innovation.users?.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>Intended User Groups</Text>
                      {innovation.users.slice(0, 5).map((u, i) => (
                        <View key={i} style={styles.userItem}>
                          <View style={styles.userDot} />
                          <Text style={styles.userText}>{u}</Text>
                        </View>
                      ))}
                    </>
                  )}
                  <Text style={styles.sectionTitle}>Key Benefits</Text>
                  <View style={styles.benefitItem}>
                    <View style={[styles.benefitDot, { backgroundColor: '#22c55e' }]} />
                    <Text style={styles.benefitText}>Readiness: {readiness.name} — {readiness.description}</Text>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={[styles.benefitDot, { backgroundColor: '#3b82f6' }]} />
                    <Text style={styles.benefitText}>Adoption: {adoption.name} — {adoption.description}</Text>
                  </View>
                  {innovation.cost === 'low' && (
                    <View style={styles.benefitItem}>
                      <View style={[styles.benefitDot, { backgroundColor: '#22c55e' }]} />
                      <Text style={styles.benefitText}>Low cost — accessible to resource-constrained users</Text>
                    </View>
                  )}
                  <Text style={styles.sectionTitle}>Source & Adoption</Text>
                  <Text style={styles.sourceText}>
                    {innovation.dataSource} — {innovation.owner || innovation.partner || 'Multiple partners'}
                  </Text>
                  {innovation.sdgs?.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>SDG Alignment</Text>
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
                              <Text style={styles.sdgBoxText}>{num}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {sdgInfo && (
                        <View style={styles.sdgPopup}>
                          <Text style={[styles.sdgPopupTitle, { color: sdgInfo.color }]}>SDG {sdgInfo.number}: {sdgInfo.name}</Text>
                          <Text style={styles.sdgPopupDesc}>{sdgInfo.description}</Text>
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
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpCount: { fontSize: 10, color: '#666' },
  previewWrap: { flex: 1, justifyContent: 'space-between', minHeight: 0 },
  previewDescScroll: { flex: 1, minHeight: 0 },
  previewDescContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  previewBtnWrap: { paddingHorizontal: 20, paddingTop: 12 },
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
