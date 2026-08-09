import React, { createContext, useState, useCallback } from 'react';
import { readBookmarks } from '../storage/localState';

export const BookmarkCountContext = createContext({ bookmarkCount: 0, refreshBookmarkCount: () => {} });

export function BookmarkCountProvider({ children }) {
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const refreshBookmarkCount = useCallback(async () => {
    // readBookmarks is total — it returns [] rather than throwing on a corrupt
    // or absent entry, so the guard that used to live here is redundant.
    setBookmarkCount((await readBookmarks()).length);
  }, []);

  return (
    <BookmarkCountContext.Provider value={{ bookmarkCount, refreshBookmarkCount }}>
      {children}
    </BookmarkCountContext.Provider>
  );
}
