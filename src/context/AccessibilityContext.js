import React, { createContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  reduceMotion: 'settingsReduceMotion',
  textSize: 'settingsTextSize',
  colorBlindMode: 'settingsColorBlindMode',
};

const TEXT_SCALE = { small: 0.9, default: 1, large: 1.2 };

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
  const [textSize, setTextSizeState] = useState('default');
  const [colorBlindMode, setColorBlindModeState] = useState(false);
  const [loading, setLoading] = useState(true);

  const textScale = TEXT_SCALE[textSize] ?? 1;

  const loadSettings = useCallback(async () => {
    try {
      const [motionRaw, sizeRaw, colorRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.reduceMotion),
        AsyncStorage.getItem(STORAGE_KEYS.textSize),
        AsyncStorage.getItem(STORAGE_KEYS.colorBlindMode),
      ]);
      setReduceMotionState(motionRaw === 'true');
      setTextSizeState(sizeRaw || 'default');
      setColorBlindModeState(colorRaw === 'true');
    } catch (e) {
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
    } catch (e) {}
  }, []);

  const setTextSize = useCallback(async (value) => {
    setTextSizeState(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.textSize, value);
    } catch (e) {}
  }, []);

  const setColorBlindMode = useCallback(async (value) => {
    setColorBlindModeState(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.colorBlindMode, value ? 'true' : 'false');
    } catch (e) {}
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
