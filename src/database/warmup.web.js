/**
 * Web twin of warmup.js: start the work Explore will need, before it asks.
 *
 * Two things, in order of how long they take.
 *
 * The vocabularies are nine small requests and translate every id the portal
 * sends into a name, so nothing can be displayed until they are in. They are
 * cached for a day, so this is usually free.
 *
 * The catalogue pass is the long one: every published record, read for its
 * readiness, adoption, countries, use cases and types. About twelve seconds
 * against a warm portal and some minutes against a cold one, which is exactly
 * why it starts while the user is still on the search screen rather than when
 * they open Explore and wait for it.
 *
 * Neither is awaited by the caller and neither failure is fatal. A screen that
 * needs either will ask again and report its own error; this only moves the
 * cost earlier.
 */
import { loadTaxonomies } from '../api/jsonapi/taxonomies';
import { loadCatalogIndex } from '../api/jsonapi/catalogIndex';
import { createLogger } from '../utils/logger';

const log = createLogger('warmup');

/**
 * Begin loading what Explore needs. Resolves once the vocabularies are in,
 * leaving the catalogue pass running behind it.
 *
 * @returns {Promise<void>}
 */
export async function warmDataLayer() {
  await loadTaxonomies();

  // Deliberately not awaited: the pass takes minutes against a cold portal,
  // and nothing on the first screen needs it. Explore joins the same promise
  // when it asks, rather than starting a second pass.
  loadCatalogIndex().catch((err) => {
    log.degraded('catalogue pass did not finish; Explore will try again:', err?.message);
  });
}
