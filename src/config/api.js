/**
 * Backend API configuration.
 *
 * Production: set EXPO_PUBLIC_API_URL to the deployed backend's https origin.
 * That value wins over everything below. It is a URL, not a secret — safe to
 * inline into the bundle, unlike the OpenAI key that used to live here.
 *
 * Development fallbacks, used only when EXPO_PUBLIC_API_URL is unset:
 * - Physical device (Expo Go): the same host as Metro (your Mac's LAN IP)
 * - iOS Simulator: localhost
 * - Android Emulator: 10.0.2.2
 *
 * The dev fallbacks are cleartext http:// on a LAN address. That is fine for a
 * dev server and unusable in production, which is exactly why a release build
 * must supply EXPO_PUBLIC_API_URL.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getApiHost() {
  // In Expo Go on a physical device, the app loads from your Mac; use that host for the API.
  // Constants.manifest was removed in SDK 49; expoConfig.hostUri is the only
  // source that can resolve on SDK 54, so the old fallback is gone.
  const debuggerHost = Constants.expoConfig?.hostUri?.replace(/^exp:\/\//, '');
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

/** Strip any trailing slash so `${SEARCH_API_URL}/api/x` never doubles up. */
function normalizeOrigin(url) {
  return url.replace(/\/+$/, '');
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const SEARCH_API_URL = configuredApiUrl
  ? normalizeOrigin(configuredApiUrl)
  : `http://${getApiHost()}:3001`;

/** True when running against the dev-host fallback rather than a configured backend. */
export const IS_DEV_API_HOST = !configuredApiUrl;

/**
 * Upload a recorded audio file to the backend for Whisper transcription.
 *
 * @param {string} fileUri - Local file URI from expo-audio recorder
 * @returns {{ text: string }}
 */
export async function transcribeAudio(fileUri) {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  });

  const response = await fetch(`${SEARCH_API_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    if (response.status === 503) {
      try {
        const data = JSON.parse(errBody);
        throw new Error(data?.error || 'Transcription not available.');
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
        throw new Error('Transcription not available. Set OPENAI_API_KEY on the server.');
      }
    }
    throw new Error(`Transcription failed (${response.status}): ${errBody}`);
  }

  return await response.json();
}

/**
 * Summarize an innovation description into exactly 3 bullets.
 *
 * DetailDrawer used to call this endpoint with a bare fetch — no timeout and no
 * res.ok check, so a hung dev server left the drawer spinning and a 500 was
 * parsed as if it were a summary. Routed through here it gets the same handling
 * as every other backend call.
 *
 * Send description text only; never metadata (title, cost, region, owner).
 *
 * @param {string} text - short + long description, already joined
 * @param {number|string} innovationId - used for server-side logging only
 * @returns {Promise<string[]|null>} exactly 3 bullets, or null when the backend
 *   has no summary to offer. Rejects on transport failure or a non-OK status.
 */
export async function summarizeBullets(text, innovationId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${SEARCH_API_URL}/api/summarize-bullets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, innovationId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Summary API error (${response.status}): ${errBody.slice(0, 100)}`);
    }

    const data = await response.json();
    const bullets = data?.bullets;
    if (Array.isArray(bullets) && bullets.length === 3 && bullets.every((b) => typeof b === 'string')) {
      return bullets;
    }
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Summary request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
