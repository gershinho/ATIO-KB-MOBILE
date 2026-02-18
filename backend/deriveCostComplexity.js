/**
 * Cost and complexity derivation logic.
 * Ported from the mobile app's src/data/constants.js so the backend can
 * return cost/complexity values without the mobile needing to re-derive them.
 */

function toSearchText(signals) {
  const a = signals.typeNames || [];
  const b = (signals.useCases || []).concat(signals.users || []);
  const desc = [signals.shortDescription, signals.longDescription]
    .filter(Boolean)
    .join(' ');
  return [...a, ...b, desc].join(' ').toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSignals(s) {
  if (!s) s = {};
  return {
    typeNames: s.types || s.typeNames || [],
    useCases: s.useCases || [],
    users: s.users || [],
    shortDescription: s.shortDescription || '',
    longDescription: s.longDescription || '',
    isGrassroots: !!s.isGrassroots,
  };
}

function deriveCost(signals) {
  const s = normalizeSignals(signals);
  const text = toSearchText(s);

  const lowCostTerms =
    /frugal|traditional|indigenous|low[- ]?cost|organic|nature[- ]?based|affordable|appropriate\s*tech|low[- ]?tech|free\s*to\s*use|minimal\s*cost|cost[- ]?effective|resource[- ]?constrained|smallholder|small[- ]?scale|low[- ]?income/;
  const highCostTerms =
    /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|automation|capital[- ]?intensive|premium|high[- ]?cost|sophisticated\s*equipment/;

  const hasLow = lowCostTerms.test(text) || s.isGrassroots;
  const hasHigh = highCostTerms.test(text);

  if (hasHigh && !hasLow) return 'high';
  if (hasLow && !hasHigh) return 'low';
  return 'med';
}

function deriveComplexity(signals) {
  const s = normalizeSignals(signals);
  const text = toSearchText(s);

  const simpleTerms =
    /frugal|traditional|indigenous|simple|basic|easy\s*to\s*use|low[- ]?cost|manual|low[- ]?tech|appropriate\s*tech|minimal\s*training|no\s*special\s*equipment|accessible/;
  const advancedTerms =
    /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|machine\s*learning|automated|sophisticated|digital\s*platform|software\s*platform|remote\s*sensing|gis\b|iot\b|automation/;

  const hasSimple = simpleTerms.test(text);
  const hasAdvanced = advancedTerms.test(text);

  if (hasAdvanced && !hasSimple) return 'advanced';
  if (hasSimple && !hasAdvanced) return 'simple';
  return 'moderate';
}

module.exports = { deriveCost, deriveComplexity };
