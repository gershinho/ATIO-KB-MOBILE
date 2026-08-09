import React, { createContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  reduceMotion: 'settingsReduceMotion',
  textSize: 'settingsTextSize',
  colorBlindMode: 'settingsColorBlindMode',
};

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
    try {
      const [motionRaw, sizeRaw, colorRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.reduceMotion),
        AsyncStorage.getItem(STORAGE_KEYS.textSize),
        AsyncStorage.getItem(STORAGE_KEYS.colorBlindMode),
      ]);
      setReduceMotionState(motionRaw === 'true');
      setTextSizeState(toKnownTextSize(sizeRaw));
      setColorBlindModeState(colorRaw === 'true');
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const setReduceMotion = useCallback(async (value) => {
    setReduceMotionState(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.reduceMotion, value ? 'true' : 'false');
    } catch {}
  }, []);

  const setTextSize = useCallback(async (value) => {
    const known = toKnownTextSize(value);
    setTextSizeState(known);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.textSize, known);
    } catch {}
  }, []);

  const setColorBlindMode = useCallback(async (value) => {
    setColorBlindModeState(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.colorBlindMode, value ? 'true' : 'false');
    } catch {}
  }, []);

  const getScaledSize = useCallback(
    (size) => Math.round(size * textScale),
    [textScale]
  );

  const value = {
    reduceMotion,
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
