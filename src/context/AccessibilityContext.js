import React, { createContext, useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS, readSetting, writeSetting } from '../storage/localState';

/**
 * The complete text-size set: the stored value, its label, and its scale.
 *
 * SettingsScreen used to declare its own {value, label} list while this module
 * declared the scales separately, so adding a size meant editing two files that
 * had no way of noticing the other had not been updated.
 */
export const TEXT_SIZES = [
  { value: 'small', label: 'Small', scale: 0.9 },
  { value: 'default', label: 'Default', scale: 1 },
  { value: 'large', label: 'Large', scale: 1.2 },
];

const DEFAULT_TEXT_SIZE = 'default';

/**
 * Storage holds whatever was last written, which is not necessarily one of ours
 * — an older build, a partial write, or a hand-edited value all end up here.
 * The read used to accept any string and hand it to a scale lookup that then
 * silently fell back to 1, so an unrecognised size looked like it applied.
 */
function toKnownTextSize(stored) {
  return TEXT_SIZES.some((size) => size.value === stored) ? stored : DEFAULT_TEXT_SIZE;
}

export const AccessibilityContext = createContext({
  reduceMotion: false,
  textSize: 'default',
  colorBlindMode: false,
  textScale: 1,
  setReduceMotion: () => {},
  setTextSize: () => {},
  setColorBlindMode: () => {},
  getScaledSize: (n) => n,
  loading: true,
});

export function AccessibilityProvider({ children }) {
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [textSize, setTextSizeState] = useState(DEFAULT_TEXT_SIZE);
  const [colorBlindMode, setColorBlindModeState] = useState(false);
  const [loading, setLoading] = useState(true);

  const textScale = TEXT_SIZES.find((size) => size.value === textSize).scale;

  const loadSettings = useCallback(async () => {
    // readSetting is total — it logs and returns the fallback rather than
    // throwing — so there is nothing left for this to catch.
    const [motionRaw, sizeRaw, colorRaw] = await Promise.all([
      readSetting(STORAGE_KEYS.reduceMotion),
      readSetting(STORAGE_KEYS.textSize),
      readSetting(STORAGE_KEYS.colorBlindMode),
    ]);
    setReduceMotionState(motionRaw === 'true');
    setTextSizeState(toKnownTextSize(sizeRaw));
    setColorBlindModeState(colorRaw === 'true');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // These three used to swallow their write failures with a bare `catch {}` —
  // the only fully silent catches in the app. writeSetting logs; the setting
  // still applies for the session, which is the right behaviour for a
  // preference, but the failure is now recorded rather than invisible.
  const setReduceMotion = useCallback(async (value) => {
    setReduceMotionState(value);
    await writeSetting(STORAGE_KEYS.reduceMotion, value ? 'true' : 'false');
  }, []);

  const setTextSize = useCallback(async (value) => {
    const known = toKnownTextSize(value);
    setTextSizeState(known);
    await writeSetting(STORAGE_KEYS.textSize, known);
  }, []);

  const setColorBlindMode = useCallback(async (value) => {
    setColorBlindModeState(value);
    await writeSetting(STORAGE_KEYS.colorBlindMode, value ? 'true' : 'false');
  }, []);

  const getScaledSize = useCallback(
    (size) => Math.round(size * textScale),
    [textScale]
  );

  // Until the stored settings have loaded, report reduced motion. Six consumers
  // read this during the AsyncStorage window and only SettingsScreen gated on
  // `loading`, so a user who had asked for reduced motion still got the launch
  // animations — the one moment the app runs the most of them at once. Erring
  // towards stillness for a few milliseconds is invisible to everyone else.
  //
  // textSize deliberately does not do this: there is no conservative size, so
  // it keeps the default and re-flows once the real value arrives.
  const value = {
    reduceMotion: loading || reduceMotion,
    reduceMotionSetting: reduceMotion,
    textSize,
    colorBlindMode,
    textScale,
    setReduceMotion,
    setTextSize,
    setColorBlindMode,
    getScaledSize,
    loading,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}
