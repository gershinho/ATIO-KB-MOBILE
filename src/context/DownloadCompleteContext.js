import React, { createContext, useState, useCallback, useEffect, useContext, useRef } from 'react';
import { Animated } from 'react-native';

export const DownloadCompleteContext = createContext({
  downloadJustCompleted: false,
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: () => {},
  triggerDrainStart: () => {},
  triggerDownloadComplete: () => {},
});

const DRAIN_DURATION_MS = 1500;

/**
 * Download indicator state for one innovation.
 *
 * The context exposes raw ids, so InnovationCard and DetailDrawer each derived
 * the same four booleans and ran the same two drain-animation effects — an
 * identical 18-line block in both, which had to be kept in sync by hand. This
 * owns that derivation next to the state it reads.
 *
 * @param {number|string|undefined} innovationId
 * @returns {{isDownloading: boolean, isDraining: boolean, isJustCompleted: boolean,
 *   isDownloadActive: boolean, drainAnim: Animated.Value}}
 */
export function useDownloadIndicator(innovationId) {
  const { downloadingInnovationId, drainingInnovationId, justCompletedInnovationId } =
    useContext(DownloadCompleteContext);

  const hasId = innovationId != null;
  const isDownloading = hasId && innovationId === downloadingInnovationId;
  const isDraining = hasId && innovationId === drainingInnovationId;
  const isJustCompleted = hasId && innovationId === justCompletedInnovationId;
  const isDownloadActive = isDownloading || isDraining || isJustCompleted;

  const drainAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDownloading) drainAnim.setValue(1);
  }, [isDownloading, drainAnim]);

  useEffect(() => {
    if (!isDraining) return;
    drainAnim.setValue(1);
    Animated.timing(drainAnim, {
      toValue: 0,
      duration: DRAIN_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [isDraining, drainAnim]);

  return { isDownloading, isDraining, isJustCompleted, isDownloadActive, drainAnim };
}

export function DownloadCompleteProvider({ children }) {
  const [downloadingInnovationId, setDownloadingInnovationId] = useState(null);
  const [drainingInnovationId, setDrainingInnovationId] = useState(null);
  const [justCompletedInnovationId, setJustCompletedInnovationId] = useState(null);

  const downloadJustCompleted = justCompletedInnovationId != null;

  const triggerDownloadStart = useCallback((innovationId) => {
    setDownloadingInnovationId(innovationId);
  }, []);

  const triggerDrainStart = useCallback((innovationId) => {
    setDownloadingInnovationId(null);
    setDrainingInnovationId(innovationId || null);
  }, []);

  const triggerDownloadComplete = useCallback((innovationId) => {
    setDrainingInnovationId(null);
    setJustCompletedInnovationId(innovationId || null);
  }, []);

  useEffect(() => {
    if (!justCompletedInnovationId) return;
    const t = setTimeout(() => setJustCompletedInnovationId(null), 2000);
    return () => clearTimeout(t);
  }, [justCompletedInnovationId]);

  return (
    <DownloadCompleteContext.Provider
      value={{
        downloadJustCompleted,
        downloadingInnovationId,
        drainingInnovationId,
        justCompletedInnovationId,
        triggerDownloadStart,
        triggerDrainStart,
        triggerDownloadComplete,
      }}
    >
      {children}
    </DownloadCompleteContext.Provider>
  );
}
