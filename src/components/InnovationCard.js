import React from 'react';
import { StyleSheet, View, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadIndicator } from '../context/DownloadContext';
import AppText from './AppText';

/**
 * @param {object} innovation - the record; title, countries, descriptions, cost,
 *   complexity, grassroots flag and the two counts are all read from it. The
 *   card used to take those eight as separate props *alongside* the object, so
 *   every call site restated the same mapping and one prop (readinessLevel) was
 *   passed but never declared.
 * @param {boolean} showActions - renders the icon row and the download button.
 *   Named showTopIcons before, which understated it: it also gates the download
 *   control at the bottom of the card.
 */
export default function InnovationCard({
  innovation,
  onLearnMore,
  isBookmarked = false,
  onBookmark,
  onDownload,
  showActions = true,
  onThumbsUp,
  onComments,
  isLiked = false,
}) {
  const { isDownloadActive, drainAnim } = useDownloadIndicator(innovation?.id);

  const title = innovation?.title ?? '';
  const description = innovation?.shortDescription ?? '';
  const cost = innovation?.cost;
  const complexity = innovation?.complexity;
  const isGrassroots = !!innovation?.isGrassroots;
  const thumbsUpCount = innovation?.thumbsUpCount ?? 0;
  const commentCount = innovation?.commentCount ?? 0;
  const handleThumbsUpPress = () => {
    if (innovation && onThumbsUp) onThumbsUp(innovation);
  };

  const costLabel = cost === 'low' ? '$ Low' : cost === 'high' ? '$$$ High' : '$$ Moderate';
  const complexLabel = complexity ? complexity.charAt(0).toUpperCase() + complexity.slice(1) : '';

  // innovation.countries is always an array; the caller used to pre-join it into
  // a string, which this then split apart again.
  const countriesList = Array.isArray(innovation?.countries) ? innovation.countries : [];
  const countriesDisplay = countriesList.length <= 2
    ? countriesList.join(', ')
    : `${countriesList.slice(0, 2).join(', ')} +${countriesList.length - 2}`;

  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            {isGrassroots && (
              <Ionicons name="leaf-outline" size={16} color="#16a34a" style={styles.grassrootsLeaf} />
            )}
            <AppText style={styles.title} numberOfLines={2}>{title}</AppText>
          </View>
          <View style={styles.countryRow}>
            <Ionicons name="location-outline" size={12} color="#999" />
            <AppText style={styles.countryText} numberOfLines={1}>{countriesDisplay || innovation?.region || ''}</AppText>
          </View>
        </View>
        {showActions && (
          <View style={styles.iconRow}>
            {/* These are icon-only controls, so each needs an explicit label —
                without one a screen reader announces just "button". */}
            <TouchableOpacity
              style={[styles.iconBtn, isBookmarked && styles.iconBtnBookmarked]}
              onPress={() => onBookmark?.(innovation)}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              accessibilityState={{ selected: isBookmarked }}
            >
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={isBookmarked ? '#fff' : '#333'} />
            </TouchableOpacity>
            {onComments != null && (
              <View style={styles.commentsWrap}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => onComments?.(innovation)}
                  accessibilityRole="button"
                  accessibilityLabel={`Comments (${commentCount})`}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#333" />
                </TouchableOpacity>
                <AppText style={styles.commentCount}>{commentCount}</AppText>
              </View>
            )}
            <View style={styles.thumbsUpWrap}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={handleThumbsUpPress}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Remove like' : 'Like'}
                accessibilityState={{ selected: isLiked }}
              >
                <Ionicons
                  name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={18}
                  color={isLiked ? '#22c55e' : '#333'}
                />
              </TouchableOpacity>
              <AppText style={styles.likesCount}>{thumbsUpCount}</AppText>
            </View>
          </View>
        )}
      </View>
      <AppText style={styles.desc} numberOfLines={3} ellipsizeMode="tail">
        {description || ''}
      </AppText>
      {(cost || complexity) && (
        <>
          <View style={styles.chipRow}>
            {cost && (
              <View style={[styles.chip, { backgroundColor: '#f0f9ff' }]}>
                <AppText style={[styles.chipText, { color: '#0369a1' }]}>{costLabel}</AppText>
              </View>
            )}
            {complexity && (
              <View style={[styles.chip, { backgroundColor: '#fdf4ff' }]}>
                <AppText style={[styles.chipText, { color: '#7e22ce' }]}>{complexLabel}</AppText>
              </View>
            )}
          </View>
        </>
      )}

      <View style={styles.bottom}>
        <View style={styles.bottomLeft}>
          <TouchableOpacity
            style={styles.learnBtn}
            onPress={onLearnMore}
            activeOpacity={0.7}
            disabled={!onLearnMore}
          >
            <AppText style={styles.learnBtnText}>Learn more</AppText>
          </TouchableOpacity>
        </View>
        {showActions && onDownload && (
          <TouchableOpacity
            style={styles.downloadIconBtn}
            onPress={() => onDownload(innovation)}
            activeOpacity={0.7}
          >
            <View style={styles.downloadIconBtnInner}>
              {isDownloadActive && (
                <Animated.View
                  style={[
                    styles.downloadIconBtnFill,
                    {
                      height: drainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 36] }),
                    },
                  ]}
                />
              )}
              <Ionicons name="download-outline" size={18} color={isDownloadActive ? '#22c55e' : '#333'} style={styles.downloadIconIcon} />
            </View>
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
  commentsWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesCount: { fontSize: 10, color: '#999' },
  commentCount: { fontSize: 10, color: '#999' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  countryText: { fontSize: 11, color: '#999', flex: 1 },
  desc: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 10, alignSelf: 'stretch', width: '100%' },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f3f3' },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  learnBtn: { backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  learnBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  downloadIconBtn: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  downloadIconBtnInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f3f3', alignItems: 'center', justifyContent: 'center' },
  downloadIconBtnFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, backgroundColor: '#dcfce7', borderRadius: 18 },
  downloadIconIcon: { zIndex: 1 },
});
