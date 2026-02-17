import React, { createContext, useState, useCallback, useEffect } from 'react';

export const DownloadCompleteContext = createContext({
  downloadJustCompleted: false,
  triggerDownloadComplete: () => {},
});

export function DownloadCompleteProvider({ children }) {
  const [downloadJustCompleted, setDownloadJustCompleted] = useState(false);

  const triggerDownloadComplete = useCallback(() => {
    setDownloadJustCompleted(true);
  }, []);

  useEffect(() => {
    if (!downloadJustCompleted) return;
    const t = setTimeout(() => setDownloadJustCompleted(false), 2000);
    return () => clearTimeout(t);
  }, [downloadJustCompleted]);

  return (
    <DownloadCompleteContext.Provider value={{ downloadJustCompleted, triggerDownloadComplete }}>
      {children}
    </DownloadCompleteContext.Provider>
  );
}
