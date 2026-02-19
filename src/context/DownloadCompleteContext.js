import React, { createContext, useState, useCallback, useEffect } from 'react';

export const DownloadCompleteContext = createContext({
  downloadJustCompleted: false,
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: () => {},
  triggerDrainStart: () => {},
  triggerDownloadComplete: () => {},
});

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
