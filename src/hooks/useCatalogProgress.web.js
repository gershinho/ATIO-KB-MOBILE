import { useEffect, useState } from 'react';
import { subscribeCatalogProgress } from '../api/jsonapi/catalogIndex';

/**
 * Where the catalogue pass has got to, for a screen waiting on it.
 *
 * The drilldown filters on the catalogue index, so a browser that has none yet
 * waits for the pass before any filtered list can appear. This lets that wait
 * say how far along it is. It reports only a pass something is blocked on; a
 * background refresh behind a stored copy stays at `loading: false`.
 *
 * @returns {{loading: boolean, rows: number, total: number|null}}
 */
export default function useCatalogProgress() {
  const [progress, setProgress] = useState({ loading: false, rows: 0, total: null });
  useEffect(() => subscribeCatalogProgress(setProgress), []);
  return progress;
}
