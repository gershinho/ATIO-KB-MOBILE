/**
 * Whether this platform ships the bundled catalogue.
 *
 * Lets the UI avoid offering features that read it — the two heat maps — rather
 * than letting the user open them and meet an error. The split is a constant
 * rather than a Platform.OS check at each call site, so the knowledge of what
 * each platform can do stays in the database layer with the rest of it.
 */
export const CATALOGUE_AVAILABLE = true;
