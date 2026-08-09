import React, {
  createContext, useState, useCallback, useEffect, useContext, useRef,
} from 'react';
import { Animated } from 'react-native';
import { AccessibilityContext } from './AccessibilityContext';

/**
 * The state of the one in-flight download, from start to drain to completion.
 *
 * Was DownloadContext, named for the last of the three states it owns.
 * Two thirds of its surface — `triggerDownloadStart`, `downloadingInnovationId`,
 * the drain phase — is about a download that has not completed.
 */
export const DownloadContext = createContext({
  downloadJustCompleted: false,
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: () => {},
  triggerDrainStart: () => {},
  triggerDownloadComplete: () => {},
});

/**
 * How long the drain animation runs. Exported because useDownloadPipeline waits
 * exactly this long before declaring the download complete — the two used to be
 * separate 1500 literals in separate files that had to stay equal with nothing
 * linking them.
 */
export const DRAIN_DURATION_MS = 1500;
const JUST_COMPLETED_DURATION_MS = 2000;

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
    useContext(DownloadContext);
  const { reduceMotion } = useContext(AccessibilityContext);

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
    // Reduced motion still needs the indicator to end up empty — it just gets
    // there without the sweep. This was the last animation in the app that
    // ignored the setting.
    if (reduceMotion) {
      drainAnim.setValue(0);
      return;
    }
    drainAnim.setValue(1);
    const animation = Animated.timing(drainAnim, {
      toValue: 0,
      duration: DRAIN_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isDraining, drainAnim, reduceMotion]);

  return { isDownloading, isDraining, isJustCompleted, isDownloadActive, drainAnim };
}

export function DownloadProvider({ children }) {
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
    const timer = setTimeout(() => setJustCompletedInnovationId(null), JUST_COMPLETED_DURATION_MS);
    return () => clearTimeout(timer);
  }, [justCompletedInnovationId]);

  return (
    <DownloadContext.Provider
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
    </DownloadContext.Provider>
  );
}
