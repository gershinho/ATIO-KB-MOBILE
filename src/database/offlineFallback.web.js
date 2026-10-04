/**
 * Web twin: answer a failed read from what is already on the device.
 *
 * The seam exists so the hooks can ask for a fallback without knowing which
 * platform they are on. Everything these do lives in storage/.
 */
export { searchCached as searchCachedInnovations } from '../storage/cachedSearch';
export { exploreFromCache } from '../storage/cachedExplore';
