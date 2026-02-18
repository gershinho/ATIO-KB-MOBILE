/**
 * Backend API configuration.
 *
 * - Physical device (Expo Go): Uses the same host as Metro (your Mac's LAN IP) so the
 *   phone can reach the backend. Expo exposes this in the manifest.
 * - iOS Simulator: localhost
 * - Android Emulator: 10.0.2.2
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getApiHost() {
  // In Expo Go on a physical device, the app loads from your Mac; use that host for the API
  const debuggerHost = Constants.expoConfig?.hostUri?.replace(/^exp:\/\//, '') ?? Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host; // e.g. 192.168.4.182
    }
  }
  return Platform.select({
    android: '10.0.2.2',
    default: 'localhost',
  });
}

export const SEARCH_API_URL = `http://${getApiHost()}:3001`;

/**
 * Call the AI search backend.
 * @param {string} query - The user's natural language problem description
 * @param {number} offset - Pagination offset (default 0)
 * @param {number} limit - Number of results per page (default 5)
 * @returns {{ results: Array, hasMore: boolean, total: number }}
 */
export async function aiSearch(query, offset = 0, limit = 5) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(`${SEARCH_API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, offset, limit }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Search API error (${response.status}): ${errBody}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Search request timed out. Please try again.');
    }
    throw err;
  }
}
