/**
 * Whatever the data layer wants doing before a screen asks it anything.
 *
 * On the phone that is opening SQLite: the bundled file is copied out of the
 * asset bundle on first use, which is slow enough to be worth doing while the
 * user is still reading the home screen.
 *
 * The web build has its own answer in warmup.web.js. Having the twins both
 * called `warmDataLayer` is what keeps HomeScreen from knowing the difference.
 */
import { initDatabase } from './connection';

/**
 * Open the catalogue, ignoring failure.
 *
 * A failed warmup is not a failed screen: the first real query opens the
 * database again and reports its own error if it cannot.
 *
 * @returns {Promise<void>} resolves when the database is open or has failed
 */
export async function warmDataLayer() {
  await initDatabase();
}
