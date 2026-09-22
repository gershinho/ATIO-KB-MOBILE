import React from 'react';
import { StyleSheet, View, TouchableOpacity, Pressable, Animated } from 'react-native';
import Icon from './icons/Icon';
import { costLevel, complexityLevel } from '../data/constants';
import { useDownloadIndicator } from '../context/DownloadContext';
import { COLORS, RADIUS } from '../theme/fao';
import AppText from './AppText';

/** Shown when a derived cost or complexity is absent or outside its known set. */
const UNKNOWN_LEVEL = { label: '—', color: COLORS.textMuted, background: COLORS.surfaceMuted };

/**
 * Wraps a control's handler so pressing it does not also open the drawer.
 *
 * The whole card is pressable, so on web the click from a nested control
 * bubbles to the card's DOM node and would fire both. Native is already safe —
 * the responder system grants the touch to the deepest view that wants it — but
 * the guard is harmless there and keeps one code path for both.
 */
function withoutOpeningCard(handler) {
  return (event) => {
    event?.stopPropagation?.();
    handler?.();
  };
}

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

  // Looked up, not re-typed. This was the last of the three places that mapped
  // these values inline, and the only one still ending in a bare `: '$$ Moderate'`
  // — so an unrecognised or absent cost reached the user as a confident, specific,
  // wrong answer on the most-seen surface in the app, while the drawer and the
  // export already showed it as unknown. The labels had drifted too: the card said
  // '$ Low' where the canonical label is '$ Low / Free', so one record read two
  // ways depending on where you saw it.
  const costInfo = costLevel(cost) ?? UNKNOWN_LEVEL;
  const complexityInfo = complexityLevel(complexity) ?? UNKNOWN_LEVEL;

  // innovation.countries is always an array; the caller used to pre-join it into
  // a string, which this then split apart again.
  const countriesList = Array.isArray(innovation?.countries) ? innovation.countries : [];
  const countriesDisplay = countriesList.length <= 2
    ? countriesList.join(', ')
    : `${countriesList.slice(0, 2).join(', ')} +${countriesList.length - 2}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && onLearnMore && styles.cardPressed]}
      onPress={onLearnMore}
      disabled={!onLearnMore}
      accessibilityRole="button"
      accessibilityLabel={title ? `${title}. Show details` : 'Show details'}
    >
      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            {isGrassroots && (
              <Icon name="leaf-outline" size={16} color={COLORS.eco} style={styles.grassrootsLeaf} />
            )}
            <AppText style={styles.title} numberOfLines={2}>{title}</AppText>
          </View>
          <View style={styles.countryRow}>
            <Icon name="location-outline" size={12} color={COLORS.textMuted} />
            <AppText style={styles.countryText} numberOfLines={1}>{countriesDisplay || innovation?.region || ''}</AppText>
          </View>
        </View>
        {showActions && (
          <View style={styles.iconRow}>
            {/* These are icon-only controls, so each needs an explicit label —
                without one a screen reader announces just "button". */}
            <TouchableOpacity
              style={[styles.iconBtn, isBookmarked && styles.iconBtnBookmarked]}
              onPress={withoutOpeningCard(() => onBookmark?.(innovation))}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              accessibilityState={{ selected: isBookmarked }}
            >
              <Icon name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={18} color={isBookmarked ? COLORS.textInverse : COLORS.textBody} />
            </TouchableOpacity>
            {onComments != null && (
              <View style={styles.commentsWrap}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={withoutOpeningCard(() => onComments?.(innovation))}
                  accessibilityRole="button"
                  accessibilityLabel={`Comments (${commentCount})`}
                >
                  <Icon name="chatbubble-ellipses-outline" size={18} color={COLORS.textBody} />
                </TouchableOpacity>
                <AppText style={styles.commentCount}>{commentCount}</AppText>
              </View>
            )}
            <View style={styles.thumbsUpWrap}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={withoutOpeningCard(handleThumbsUpPress)}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Remove like' : 'Like'}
                accessibilityState={{ selected: isLiked }}
              >
                <Icon
                  name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={18}
                  color={isLiked ? COLORS.primary : COLORS.textBody}
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
              <View style={[styles.chip, { backgroundColor: costInfo.background }]}>
                <AppText style={[styles.chipText, { color: costInfo.color }]}>
                  {costInfo.label}
                </AppText>
              </View>
            )}
            {complexity && (
              <View style={[styles.chip, { backgroundColor: complexityInfo.background }]}>
                <AppText style={[styles.chipText, { color: complexityInfo.color }]}>
                  {complexityInfo.label}
                </AppText>
              </View>
            )}
          </View>
        </>
      )}

      <View style={styles.bottom}>
        <View style={styles.bottomLeft}>
          <TouchableOpacity
            style={styles.learnBtn}
            onPress={withoutOpeningCard(onLearnMore)}
            activeOpacity={0.7}
            disabled={!onLearnMore}
          >
            <AppText style={styles.learnBtnText}>Learn more</AppText>
          </TouchableOpacity>
        </View>
        {showActions && onDownload && (
          <TouchableOpacity
            style={styles.downloadIconBtn}
            onPress={withoutOpeningCard(() => onDownload(innovation))}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Download"
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
              <Icon name="download-outline" size={18} color={isDownloadActive ? COLORS.primary : COLORS.textBody} style={styles.downloadIconIcon} />
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.textHeading,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  // The card is a control now, so it needs a pressed state. Border rather than
  // opacity: fading the whole card also fades its text.
  cardPressed: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  contentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  leftCol: { flex: 1, minWidth: 0, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20, minWidth: 0, color: COLORS.textHeading },
  grassrootsLeaf: { marginTop: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  iconBtnBookmarked: { backgroundColor: COLORS.primary },
  commentsWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thumbsUpWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesCount: { fontSize: 10, color: COLORS.textMuted },
  commentCount: { fontSize: 10, color: COLORS.textMuted },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  countryText: { fontSize: 11, color: COLORS.textMuted, flex: 1 },
  desc: { fontSize: 12, color: COLORS.textBody, lineHeight: 18, marginBottom: 10, alignSelf: 'stretch', width: '100%' },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm },
  chipText: { fontSize: 10, fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  learnBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 8 },
  learnBtnText: { color: COLORS.textInverse, fontSize: 12, fontWeight: '600' },
  downloadIconBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, overflow: 'hidden' },
  downloadIconBtnInner: { width: 36, height: 36, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  downloadIconBtnFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.pill },
  downloadIconIcon: { zIndex: 1 },
});
