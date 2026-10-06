/**
 * Where the catalogue pass has got to, for a screen waiting on it.
 *
 * On the phone there is no pass: the catalogue is a bundled SQLite file, so a
 * filter never waits on one. The web twin subscribes to the real thing.
 *
 * @returns {{loading: boolean, rows: number, total: number|null}}
 */
const IDLE = { loading: false, rows: 0, total: null };

export default function useCatalogProgress() {
  return IDLE;
}
