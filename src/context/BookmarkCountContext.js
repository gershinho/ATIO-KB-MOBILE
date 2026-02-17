import React, { createContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKMARKS_KEY = 'bookmarkedInnovations';

export const BookmarkCountContext = createContext({ bookmarkCount: 0, refreshBookmarkCount: () => {} });

export function BookmarkCountProvider({ children }) {
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const refreshBookmarkCount = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setBookmarkCount(arr.length);
    } catch (e) {
      setBookmarkCount(0);
    }
  }, []);

  return (
    <BookmarkCountContext.Provider value={{ bookmarkCount, refreshBookmarkCount }}>
      {children}
    </BookmarkCountContext.Provider>
  );
}
