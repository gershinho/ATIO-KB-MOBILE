/**
 * FAO Design System tokens — https://design-system.fao.org/styles/
 *
 * The raw palette is copied verbatim from the "Colors" page. Everything under
 * COLORS is a semantic name pointing at one of those values, so a screen refers
 * to `COLORS.textMuted` rather than restating `#999999`. Before this file the
 * app carried ~300 hardcoded hex literals from a Tailwind-ish palette and no
 * single place to change them.
 *
 * Two sets of colors are deliberately NOT expressed here:
 *   - SDG colors (constants.js) are official UN brand values and are left alone.
 *   - Per-category taxonomy hues stay distinct per category because they carry
 *     information; they were only muted to sit alongside FAO blue.
 */

/** Verbatim from design-system.fao.org/styles/colors. */
export const FAO = {
  primary: '#116AAB',
  primaryLight: '#E5ECF4',
  grayDark: '#545454',
  grayMedium: '#999999',
  grayLight: '#F2F2F2',
  whiteFao: '#F7F8F9',
  orange: '#F58320',
  caption: '#1C4767',
  emergency: '#980000',
  unBlue: '#5792C9',
  white: '#FFFFFF',
};

/**
 * Tints derived from the FAO values above, for chip and badge backgrounds.
 * The design system specifies only Primary Light, so the rest follow the same
 * recipe: the base hue lifted to roughly 92% lightness.
 */
const TINT = {
  orange: '#FDF0E4',
  emergency: '#F5E7E7',
  caption: '#E8EDF2',
  eco: '#EAF1E9',
};

/**
 * Agriculture green. FAO's palette has none, so this is SDG 13's "Climate
 * Action" green — already in this codebase and from the same UN family — used
 * only where green is the meaning (the grassroots leaf), never as a UI accent.
 */
const ECO = '#3F7E44';

export const COLORS = {
  // Surfaces
  appBg: FAO.whiteFao,
  surface: FAO.white,
  surfaceMuted: FAO.grayLight,
  surfaceSunken: FAO.whiteFao,

  // Borders. FAO typography defers to Bootstrap, so these are Bootstrap's
  // gray-300/400 rather than invented values.
  border: '#DEE2E6',
  borderStrong: '#CED4DA',

  // Text hierarchy: navy for headings, gray-dark for body, gray-medium for meta.
  textHeading: FAO.caption,
  textBody: FAO.grayDark,
  textMuted: FAO.grayMedium,
  textInverse: FAO.white,

  // Interactive
  primary: FAO.primary,
  primaryLight: FAO.primaryLight,
  primaryDark: FAO.caption,
  accent: FAO.orange,
  info: FAO.unBlue,
  danger: FAO.emergency,
  eco: ECO,

  // Tinted backgrounds
  primaryTint: FAO.primaryLight,
  accentTint: TINT.orange,
  dangerTint: TINT.emergency,
  captionTint: TINT.caption,
  ecoTint: TINT.eco,

  // Scrims
  scrim: 'rgba(28, 71, 103, 0.45)',
};

/**
 * FAO specifies Open Sans on fao.org subdomains and Helvetica/Arial elsewhere.
 * This app ships off-domain, so the stack leads with the system face and falls
 * back the way the design system asks.
 */
/**
 * Sequential scales for the two heatmaps, light -> dark in a single hue.
 *
 * Both replace rainbow ramps (the readiness grid ran green -> teal -> sky ->
 * indigo -> purple), where hue carried the magnitude and nothing carried order,
 * so a reader had to consult the legend to tell a high cell from a low one.
 * A one-hue ramp puts the ordering in the lightness instead.
 *
 * Checked with the dataviz validator's validateOrdinal against a white surface:
 * lightness monotone, every adjacent gap >= 0.06, hue spread within 4 degrees,
 * and the light end at or above the 2:1 contrast floor so the palest cell is
 * still visible against the card behind it. Re-run that check before editing a
 * step; the values are not free-hand.
 */
export const SCALES = {
  /** Readiness x adoption density, 5 steps. Light end 2.07:1 on white. */
  readiness: ['#96B8D9', '#769ABB', '#587D9E', '#3A6282', '#1C4767'],
  /** Opportunity score, 4 bands, anchored on FAO Orange. Light end 2.58:1. */
  opportunity: ['#F58320', '#D16D18', '#AE5710', '#8C4208'],
};

export const FONT_STACK = 'Open Sans, Helvetica Neue, Helvetica, Arial, sans-serif';

/** Bootstrap's radius scale, which the FAO components are built on. */
export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
};

export default COLORS;
