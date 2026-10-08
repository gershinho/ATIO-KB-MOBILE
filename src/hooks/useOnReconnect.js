import { useEffect, useRef } from 'react';
import useOnlineStatus from './useOnlineStatus';

/**
 * Run `callback` when the browser goes from offline to online.
 *
 * For screens that loaded while offline and showed the device's saved copy or
 * an error: without this, that stayed on screen after reconnecting until the
 * user navigated away. Only the offline-to-online edge — going offline needs no
 * reload, because what is on screen is still the best the device can show.
 *
 * Never fires on native, where useOnlineStatus is always true.
 *
 * @param {() => void} callback
 * @returns {boolean} whether the browser believes it is online
 */
export default function useOnReconnect(callback) {
  const online = useOnlineStatus();
  const wasOnline = useRef(online);
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (online && !wasOnline.current) latest.current();
    wasOnline.current = online;
  }, [online]);

  return online;
}
