/**
 * Cost and complexity derivation — the one copy.
 *
 * Neither value is stored. Both are inferred from an innovation's types, use
 * cases, prospective users and description text, and both the app and the
 * backend have to reach the same answer for the same innovation: the app
 * derives them for display and filtering, the backend returns them on search
 * results, and a user filtering by "low cost" would otherwise get rows that
 * disagree with their own badges.
 *
 * This existed twice — src/data/constants.js and backend/deriveCostComplexity.js
 * — with the backend copy's header describing itself as "ported from" the app.
 * A parity test compared the two, which caught divergence after the fact but
 * could not prevent it, and only for the inputs the test happened to try.
 *
 * Written as CommonJS deliberately: the backend is CJS and cannot import ESM
 * synchronously, while Metro and Babel both consume CJS from the app side
 * without ceremony. This is the one direction that works for both.
 */

/** Flatten every text signal into one lowercased haystack. */
function toSearchText(signals) {
  const typeNames = signals.typeNames || [];
  const termNames = (signals.useCases || []).concat(signals.users || []);
  const description = [signals.shortDescription, signals.longDescription]
    .filter(Boolean)
    .join(' ');
  return [...typeNames, ...termNames, description]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Normalise a signal bag.
 *
 * Previously also accepted a bare array of type names and a `typeNames` alias
 * for `types`. No caller in either package used either shape, so both are gone;
 * the accepted input is now exactly one thing.
 */
function normalizeSignals(signals) {
  const s = signals || {};
  return {
    typeNames: s.types || [],
    useCases: s.useCases || [],
    users: s.users || [],
    shortDescription: s.shortDescription || '',
    longDescription: s.longDescription || '',
    isGrassroots: !!s.isGrassroots,
  };
}

const LOW_COST_TERMS = /frugal|traditional|indigenous|low[- ]?cost|organic|nature[- ]?based|affordable|appropriate\s*tech|low[- ]?tech|free\s*to\s*use|minimal\s*cost|cost[- ]?effective|resource[- ]?constrained|smallholder|small[- ]?scale|low[- ]?income/;
const HIGH_COST_TERMS = /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|automation|capital[- ]?intensive|premium|high[- ]?cost|sophisticated\s*equipment/;

const SIMPLE_TERMS = /frugal|traditional|indigenous|simple|basic|easy\s*to\s*use|low[- ]?cost|manual|low[- ]?tech|appropriate\s*tech|minimal\s*training|no\s*special\s*equipment|accessible/;
const ADVANCED_TERMS = /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|machine\s*learning|automated|sophisticated|digital\s*platform|software\s*platform|remote\s*sensing|gis\b|iot\b|automation/;

/**
 * Derive cost from types, use cases, description, users and grassroots status.
 *
 * Signals pointing both ways cancel out to 'med' rather than one winning: an
 * innovation described as both low-cost and satellite-based is genuinely
 * ambiguous, and picking a side would be a guess presented as a fact.
 *
 * @param {object} signals
 * @returns {'low'|'med'|'high'} see COST_LEVELS in src/data/constants.js
 */
function deriveCost(signals) {
  const s = normalizeSignals(signals);
  const text = toSearchText(s);

  const hasLow = LOW_COST_TERMS.test(text) || s.isGrassroots;
  const hasHigh = HIGH_COST_TERMS.test(text);

  if (hasHigh && !hasLow) return 'high';
  if (hasLow && !hasHigh) return 'low';
  return 'med';
}

/**
 * Derive complexity from types, use cases and description.
 *
 * @param {object} signals
 * @returns {'simple'|'moderate'|'advanced'} see COMPLEXITY_LEVELS
 */
function deriveComplexity(signals) {
  const s = normalizeSignals(signals);
  const text = toSearchText(s);

  const hasSimple = SIMPLE_TERMS.test(text);
  const hasAdvanced = ADVANCED_TERMS.test(text);

  if (hasAdvanced && !hasSimple) return 'advanced';
  if (hasSimple && !hasAdvanced) return 'simple';
  return 'moderate';
}

module.exports = { deriveCost, deriveComplexity };
