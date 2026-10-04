/**
 * Searching by a typed question, on the phone.
 *
 * Delegates to the backend, which is where it has always gone. The phone reads
 * the bundled SQLite catalogue for Explore and the backend reads the same file
 * for search, so on the phone the two surfaces already agree about what an
 * innovation is — the same 3,075 records under the same integer ids. There is
 * nothing here to fix, and FTS5's BM25 ranks better than anything we could do
 * over a few hundred candidates.
 *
 * The web twin is the one that differs, because there Explore reads FAO's
 * JSON:API and the bundled file is neither present nor current.
 */
import { aiSearch } from '../services/api';

/**
 * @param {string} query
 * @param {{offset?: number, limit?: number}} [options]
 * @returns {Promise<{query: string, results: Array<object>, hasMore: boolean, total?: number}>}
 */
export async function searchByQuery(query, options = {}) {
  return aiSearch(query, options);
}
