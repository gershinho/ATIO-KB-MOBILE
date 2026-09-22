import React, { useContext } from 'react';
import { StyleSheet, Text, Platform } from 'react-native';
import { AccessibilityContext } from '../context/AccessibilityContext';
import { FONT_STACK } from '../theme/fao';

/** React Native's own default when a style sets no fontSize. */
const DEFAULT_FONT_SIZE = 14;

/**
 * The FAO typeface, web only.
 *
 * The design system asks for Open Sans on fao.org and Helvetica or Arial
 * elsewhere; this ships off-domain, so the stack prefers Open Sans where it is
 * already installed and falls back as instructed. No webfont is downloaded,
 * which matters for a PWA expected to open offline at the booth.
 *
 * Native is left on the system face deliberately: React Native resolves
 * fontFamily to one installed family rather than a stack, so a CSS font list
 * would simply fail to match and Helvetica is already the iOS default.
 */
const BASE_TEXT_STYLE = Platform.select({
  web: { fontFamily: FONT_STACK },
  default: null,
});

/**
 * Text that honours the in-app text-size setting.
 *
 * Scaling used to be per-call-site: every `<Text>` that wanted to respect the
 * setting had to pass `fontSize: getScaledSize(n)` by hand. Predictably, some
 * modules did and others did not — the same 13pt label scaled on one screen and
 * stayed fixed on the next — and every new piece of text was a fresh
 * opportunity to forget.
 *
 * This reads the size out of whatever style it is given and scales it, so
 * honouring the setting is the default rather than something to remember. The
 * style prop keeps working exactly as it does on Text, including arrays.
 *
 * Use this for anything the user reads. Plain `Text` is still right for
 * decorative glyphs and anything with a deliberately fixed size.
 */
export default function AppText({ style, ...props }) {
  const { textScale } = useContext(AccessibilityContext);
  // Base style first so any fontFamily a call site sets still wins.
  if (textScale === 1) return <Text style={[BASE_TEXT_STYLE, style]} {...props} />;

  const flattened = StyleSheet.flatten(style) || {};
  const baseSize = flattened.fontSize ?? DEFAULT_FONT_SIZE;
  const scaled = { fontSize: Math.round(baseSize * textScale) };

  // Line height has to scale with the text or large sizes clip against a gap
  // sized for the small ones.
  if (flattened.lineHeight != null) {
    scaled.lineHeight = Math.round(flattened.lineHeight * textScale);
  }

  return <Text style={[BASE_TEXT_STYLE, style, scaled]} {...props} />;
}
