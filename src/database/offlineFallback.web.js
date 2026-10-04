/**
 * Web twin: answer a failed list from what is already on the device.
 *
 * The seam exists so useDrilldown can ask for a fallback without knowing which
 * platform it is on. Everything it does lives in storage/cachedSearch.js.
 */
export { searchCached as searchCachedInnovations } from '../storage/cachedSearch';
