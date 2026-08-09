import React from 'react';
import InnovationCard from './InnovationCard';

/**
 * An InnovationCard wired to the shared interactions hook.
 *
 * This wiring was written out byte-for-byte in SearchMode, ExploreMode and
 * DrilldownView. Each of them received the whole `interactions` object for no
 * other purpose than to re-spread it here, so adding a card action meant
 * editing three call sites plus the card itself.
 *
 * The overlay matters: `withCounts` applies the pending like/comment deltas the
 * hook holds, so the same record renders consistently everywhere it appears.
 *
 * @param {object} item - a raw record from the data layer, before the overlay
 * @param {object} interactions - the useInnovationInteractions return value
 */
export default function InteractiveInnovationCard({ item, interactions }) {
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
}
