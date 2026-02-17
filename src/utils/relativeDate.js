/**
 * Format a timestamp as relative time (e.g. "Just now", "5m ago", "2h ago", "3d ago").
 * @param {number} timestamp - Unix ms (e.g. downloadedAt)
 * @returns {string}
 */
export function formatRelativeDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
