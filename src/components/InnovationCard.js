import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function InnovationCard({
  title,
  countries,
  description,
  cost,
  complexity,
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
  isLiked = false,
  commentCount = 0,
}) {
  const handleThumbsUpPress = () => {
    if (innovation && onThumbsUp) onThumbsUp(innovation);
  };

  const costLabel = cost === 'low' ? '$ Low' : cost === 'high' ? '$$$ High' : '$$ Moderate';
  const complexLabel = complexity ? complexity.charAt(0).toUpperCase() + complexity.slice(1) : '';

  const countriesList = typeof countries === 'string' ? countries.split(',').map((c) => c.trim()).filter(Boolean) : Array.isArray(countries) ? countries : [];
  const countriesDisplay = countriesList.length <= 2
    ? countriesList.join(', ')
    : countriesList.slice(0, 2).join(', ') + ' +' + (countriesList.length - 2);

  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            {isGrassroots && (
              <Ionicons name="leaf-outline" size={16} color="#16a34a" style={styles.grassrootsLeaf} />
            )}
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>
          <View style={styles.countryRow}>
            <Ionicons name="location-outline" size={12} color="#999" />
            <Text style={styles.countryText} numberOfLines={1}>{countriesDisplay || countries || ''}</Text>
          </View>
        </View>
        {showTopIcons && (
          <View style={styles.iconRow}>
            <TouchableOpacity
              style={[styles.iconBtn, isBookmarked && styles.iconBtnBookmarked]}
              onPress={() => onBookmark?.(innovation)}
            >
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={isBookmarked ? '#fff' : '#333'} />
            </TouchableOpacity>
            {onComments != null && (
              <View style={styles.commentsWrap}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onComments?.(innovation)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#333" />
                </TouchableOpacity>
                <Text style={styles.commentCount}>{commentCount}</Text>
              </View>
            )}
            <View style={styles.thumbsUpWrap}>
              <TouchableOpacity
                style={[styles.iconBtn, isLiked && styles.iconBtnLiked]}
                onPress={handleThumbsUpPress}
              >
                <Ionicons
                  name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={18}
                  color={isLiked ? '#22c55e' : '#333'}
                />
              </TouchableOpacity>
              <Text style={styles.likesCount}>{thumbsUpCount}</Text>
            </View>
          </View>
        )}
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
  contentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  leftCol: { flex: 1, minWidth: 0, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20, minWidth: 0 },
  grassrootsLeaf: { marginTop: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconBtnBookmarked: { backgroundColor: '#2563eb' },
  iconBtnLiked: { backgroundColor: '#dcfce7' },
  commentsWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesCount: { fontSize: 10, color: '#999' },
  commentCount: { fontSize: 10, color: '#999' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  countryText: { fontSize: 11, color: '#999', flex: 1 },
  desc: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 10, alignSelf: 'stretch', width: '100%' },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f3f3' },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  learnBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  learnBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  downloadIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f3f3' },
});
