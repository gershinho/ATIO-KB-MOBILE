import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Whether the browser believes it has a connection.
 *
 * Web only. The phone carries the whole catalogue and never meets the offline
 * states, so on native this is always true and the offline UI never shows.
 *
 * `navigator.onLine` is optimistic — true can still mean a dead network — so
 * this drives what the UI *offers*, never whether the data layer tries a
 * request. The hooks already fall back to the cache on their own.
 */
export default function useOnlineStatus() {
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

function readOnline() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}
