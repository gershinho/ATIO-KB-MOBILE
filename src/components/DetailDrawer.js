import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Modal, Dimensions, Animated, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../data/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ANIM_DURATION = 320;

export default function DetailDrawer({ innovation, visible, onClose, isBookmarked, onBookmark, onDownload, startExpanded, downloadedAt }) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [selectedSdg, setSelectedSdg] = useState(null);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const expandedRef = useRef(false);
  expandedRef.current = expanded;

  const availableHeight = SCREEN_HEIGHT - insets.top;
  const previewHeight = Math.min(availableHeight * 0.32, 320);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
        onPanResponderRelease: (_, g) => {
          const dragThreshold = 40;
          const tapThreshold = 10;
          if (Math.abs(g.dy) < tapThreshold) {
            if (expandedRef.current) onClose();
            else setExpanded(true);
          } else if (g.dy < -dragThreshold) {
            setExpanded(true);
          } else if (g.dy > dragThreshold) {
            onClose();
          }
        },
      }),
    [onClose]
  );

  useLayoutEffect(() => {
    if (visible && innovation) {
      const startOpen = !!startExpanded;
      setExpanded(startOpen);
      animatedHeight.setValue(startOpen ? availableHeight : previewHeight);
    }
  }, [visible, innovation?.id, startExpanded]);

  useEffect(() => {
    if (!visible || !innovation) return;
    Animated.timing(animatedHeight, {
      toValue: expanded ? availableHeight : previewHeight,
      duration: ANIM_DURATION,
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  const handleToggle = () => setExpanded(!expanded);

  if (!innovation || !visible) return null;

  const readiness = READINESS_LEVELS.find(r => r.level === innovation.readinessLevel) || READINESS_LEVELS[0];
  const adoption = ADOPTION_LEVELS.find(a => a.level === innovation.adoptionLevel) || ADOPTION_LEVELS[0];
  const costLabel = innovation.cost === 'low' ? '$ Low / Free' : innovation.cost === 'high' ? '$$$ High' : '$$ Moderate';
  const costColor = innovation.cost === 'low' ? '#0369a1' : innovation.cost === 'high' ? '#dc2626' : '#d97706';
  const costBg = innovation.cost === 'low' ? '#f0f9ff' : innovation.cost === 'high' ? '#fef2f2' : '#fffbeb';
  const complexLabel = innovation.complexity ? innovation.complexity.charAt(0).toUpperCase() + innovation.complexity.slice(1) : 'Moderate';
  const complexColor = innovation.complexity === 'simple' ? '#16a34a' : innovation.complexity === 'advanced' ? '#7e22ce' : '#d97706';
  const complexBg = innovation.complexity === 'simple' ? '#f0fdf4' : innovation.complexity === 'advanced' ? '#fdf4ff' : '#fffbeb';
  const handleSdgPress = (num) => setSelectedSdg(selectedSdg === num ? null : num);
  const sdgInfo = selectedSdg ? SDGS.find(s => s.number === selectedSdg) : null;
  const countriesList = Array.isArray(innovation.countries)
    ? innovation.countries
    : (innovation.region ? String(innovation.region).split(',').map((c) => c.trim()).filter(Boolean) : []);
  const countriesDisplay = countriesList.length <= 5
    ? countriesList.join(', ')
    : countriesList.slice(0, 5).join(', ') + ' +' + (countriesList.length - 5);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouch} onPress={onClose} activeOpacity={1} />
        {expanded && (
          <TouchableOpacity
            style={[styles.overlayStrip, { top: 0, paddingTop: insets.top }]}
            onPress={onClose}
            activeOpacity={1}
          />
        )}
        <Animated.View style={[styles.drawer, { height: animatedHeight }]}>
          <View style={styles.handleWrap} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          {expanded && (
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#555" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {onDownload && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => onDownload(innovation)}>
                  <Ionicons name="download-outline" size={22} color="#333" />
                </TouchableOpacity>
              )}
              {onBookmark && (
                <TouchableOpacity style={[styles.actionBtn, isBookmarked && styles.actionBtnBookmarked]} onPress={() => onBookmark(innovation)}>
                  <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={isBookmarked ? '#fff' : '#333'} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn}>
                <Ionicons name="thumbs-up-outline" size={22} color="#333" />
              </TouchableOpacity>
            </View>
          )}
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
                <Text style={styles.countryText}>{countriesDisplay || innovation.region || ''}</Text>
              </View>
              {downloadedAt != null && (
                <View style={styles.downloadedRow}>
                  <Ionicons name="download-outline" size={14} color="#666" />
                  <Text style={styles.downloadedText}>
                    Downloaded: {new Date(downloadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </View>
              )}
              {!expanded ? (
                <>
                  <Text style={styles.descPreview} numberOfLines={2}>
                    {innovation.shortDescription || innovation.longDescription}
                  </Text>
                  <TouchableOpacity style={styles.viewMoreBtn} onPress={handleToggle}>
                    <Text style={styles.viewMoreText}>View More</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Overview</Text>
                  <Text style={styles.descFull}>
                    {innovation.shortDescription || innovation.longDescription?.substring(0, 500)}
                  </Text>
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
                  <Text style={styles.sectionTitle}>How to Implement</Text>
                  <View style={styles.implStep}>
                    <View style={styles.implNum}><Text style={styles.implNumText}>1</Text></View>
                    <Text style={styles.implText}>Assess needs and local conditions in your area</Text>
                  </View>
                  <View style={styles.implStep}>
                    <View style={styles.implNum}><Text style={styles.implNumText}>2</Text></View>
                    <Text style={styles.implText}>Connect with {innovation.dataSource || 'relevant organizations'} for guidance</Text>
                  </View>
                  <View style={styles.implStep}>
                    <View style={styles.implNum}><Text style={styles.implNumText}>3</Text></View>
                    <Text style={styles.implText}>Engage local extension agents and stakeholders</Text>
                  </View>
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
              )}
            </View>
          </ScrollView>
        </Animated.View>
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
  actionBtnBookmarked: { backgroundColor: '#2563eb', borderRadius: 999 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
  body: { padding: 16, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', flex: 1, color: '#111' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeText: { fontSize: 12, color: '#999' },
  grassrootsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  grassrootsText: { fontSize: 10, fontWeight: '600', color: '#16a34a' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  countryText: { fontSize: 12, color: '#999', flex: 1 },
  downloadedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  downloadedText: { fontSize: 12, color: '#666' },
  descPreview: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 10, maxHeight: 44 },
  viewMoreBtn: { backgroundColor: '#030213', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginBottom: 12 },
  viewMoreText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  descFull: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 14 },
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
  implStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  implNum: { width: 22, height: 22, backgroundColor: '#030213', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  implNumText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  implText: { fontSize: 12, color: '#555', lineHeight: 18, flex: 1, paddingTop: 2 },
  sourceText: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 12 },
  sdgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sdgBox: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  sdgBoxActive: { borderColor: '#030213', transform: [{ scale: 1.05 }] },
  sdgBoxText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sdgPopup: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sdgPopupTitle: { fontWeight: '700', fontSize: 12, marginBottom: 4 },
  sdgPopupDesc: { fontSize: 11, color: '#555', lineHeight: 16 },
});
