import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function InnovationCard({
  title,
  countries,
  description,
  cost,
  complexity,
  readinessLevel = 5,
  isGrassroots = false,
  onLearnMore,
  innovation,
  isBookmarked = false,
  onBookmark,
  onDownload,
  showTopIcons = true,
  thumbsUpCount = 0,
  onThumbsUp,
  onComments,
}) {
  const matchMap = { 9: 94, 8: 85, 7: 75, 6: 65, 5: 50, 4: 35, 3: 20, 2: 10, 1: 5 };
  const match = matchMap[readinessLevel] || 0;
  const matchColor = match > 75 ? '#16a34a' : match >= 50 ? '#d97706' : '#dc2626';
  const matchBg = match > 75 ? '#dcfce7' : match >= 50 ? '#fef3c7' : '#fee2e2';

  const [localThumbsUp, setLocalThumbsUp] = useState(thumbsUpCount);

  useEffect(() => {
    setLocalThumbsUp(thumbsUpCount);
  }, [thumbsUpCount]);

  const handleThumbsUpPress = () => {
    setLocalThumbsUp((prev) => prev + 1);
    if (innovation && onThumbsUp) {
      onThumbsUp(innovation);
    }
  };

  const costLabel = cost === 'low' ? '$ Low' : cost === 'high' ? '$$$ High' : '$$ Moderate';
  const complexLabel = complexity ? complexity.charAt(0).toUpperCase() + complexity.slice(1) : '';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {isGrassroots && (
            <View style={styles.grassrootsBadge}>
              <Ionicons name="leaf-outline" size={14} color="#16a34a" />
            </View>
          )}
        </View>
        {showTopIcons && (
          <View style={styles.iconRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onBookmark?.(innovation)}
            >
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color="#333" />
            </TouchableOpacity>
            <View style={styles.heartWrap}>
              <TouchableOpacity style={styles.iconBtn} onPress={handleThumbsUpPress}>
                <Ionicons name="thumbs-up-outline" size={18} color="#333" />
              </TouchableOpacity>
              <Text style={styles.likesCount}>{localThumbsUp}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onComments?.(innovation)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onDownload?.(innovation)}
            >
              <Ionicons name="download-outline" size={18} color="#333" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.countryRow}>
        <Ionicons name="location-outline" size={12} color="#999" />
        <Text style={styles.countryText} numberOfLines={1}>{countries || ''}</Text>
      </View>

      <Text style={styles.desc} numberOfLines={3} ellipsizeMode="tail">
        {description || ''}
      </Text>

      {(cost || complexity) && (
        <View style={styles.chipRow}>
          {cost && (
            <View style={[styles.chip, { backgroundColor: '#f0f9ff' }]}>
              <Text style={[styles.chipText, { color: '#0369a1' }]}>{costLabel}</Text>
            </View>
          )}
          {complexity && (
            <View style={[styles.chip, { backgroundColor: '#fdf4ff' }]}>
              <Text style={[styles.chipText, { color: '#7e22ce' }]}>{complexLabel}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.bottom}>
        <View style={styles.bottomLeft}>
          <TouchableOpacity
            style={styles.learnBtn}
            onPress={onLearnMore}
            activeOpacity={0.7}
            disabled={!onLearnMore}
          >
            <Text style={styles.learnBtnText}>Learn more</Text>
          </TouchableOpacity>
          <View style={[styles.matchBadge, { backgroundColor: matchBg }]}>
            <Text style={[styles.matchText, { color: matchColor }]}>{match}% Match</Text>
          </View>
        </View>
        {showTopIcons && onDownload && (
          <TouchableOpacity
            style={styles.downloadIconBtn}
            onPress={() => onDownload(innovation)}
          >
            <Ionicons name="download-outline" size={18} color="#333" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  grassrootsBadge: { backgroundColor: '#dcfce7', borderRadius: 6, padding: 4, paddingHorizontal: 6 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heartWrap: { alignItems: 'center' },
  likesCount: { fontSize: 10, color: '#999', marginTop: -2 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  countryText: { fontSize: 11, color: '#999', flex: 1 },
  desc: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f3f3' },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  learnBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  learnBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  matchBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  matchText: { fontSize: 11, fontWeight: '600' },
  downloadIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f3f3' },
});
