/**
 * Which source the web build reads its catalogue from.
 *
 *   EXPO_PUBLIC_DATA_SOURCE=supabase   the published snapshot, via RPCs
 *   EXPO_PUBLIC_DATA_SOURCE=jsonapi    the FAO portal directly (the default)
 *
 * Supabase is chosen only when the flag says so *and* both
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set,
 * so a build missing either quietly keeps the portal path, which is also the
 * rollback route. With Supabase selected, the four AI calls the web app makes
 * go to its Edge Functions as well (services/api.js).
 *
 * Kept apart from client.js so services/api.js, which the phone loads too, can
 * ask the question without pulling @supabase/supabase-js into a native bundle.
 * Both values are public by design.
 */

/** Read on every call, like jsonApiOrigin, so a test or late config can set them. */
export function supabaseSettings() {
  return {
    flag: process.env.EXPO_PUBLIC_DATA_SOURCE,
    url: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, ''),
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  };
}

/** 'supabase' or 'jsonapi'. */
export function dataSource() {
  const { flag, url, key } = supabaseSettings();
  return flag === 'supabase' && url && key ? 'supabase' : 'jsonapi';
}

export const usingSupabase = () => dataSource() === 'supabase';

/** Where a Supabase Edge Function is served, e.g. functionsUrl('rank'). */
export function functionsUrl(name) {
  return `${supabaseSettings().url}/functions/v1/${name}`;
}
