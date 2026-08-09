import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BookmarksScreen from '../../src/screens/BookmarksScreen';
import ComparisonRow from '../../src/components/comparison/ComparisonRow';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import { BookmarkCountContext } from '../../src/context/BookmarkCountContext';
import { DownloadContext } from '../../src/context/DownloadContext';
import * as localState from '../../src/storage/localState';

jest.mock('../../src/storage/localState', () => ({
  readBookmarks: jest.fn().mockResolvedValue([]),
  writeBookmarks: jest.fn().mockResolvedValue(true),
  readDownloads: jest.fn().mockResolvedValue([]),
  writeDownloads: jest.fn().mockResolvedValue(true),
  readLikedIds: jest.fn().mockResolvedValue(new Set()),
  writeLikedIds: jest.fn().mockResolvedValue(true),
}));

// useFocusEffect is the screen's load trigger, so it has to actually run.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), navigate: jest.fn() }),
  useIsFocused: () => true,
}));

const A11Y = { reduceMotion: true, colorBlindMode: false, textSize: 'default', getScaledSize: (n) => n };
const DOWNLOADS = {
  downloadJustCompleted: false,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

const bookmark = (id, title) => ({
  id,
  title,
  shortDescription: `About ${title}`,
  longDescription: `Long form detail about ${title}`,
  thumbsUpCount: 4,
  commentCount: 0,
  readinessLevel: 5,
  adoptionLevel: 3,
});

async function renderBookmarks() {
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AccessibilityContext.Provider value={A11Y}>
        <BookmarkCountContext.Provider value={{ bookmarkCount: 0, refreshBookmarkCount: jest.fn() }}>
          <DownloadContext.Provider value={DOWNLOADS}>
            <BookmarksScreen />
          </DownloadContext.Provider>
        </BookmarkCountContext.Provider>
      </AccessibilityContext.Provider>
    </SafeAreaProvider>
  );
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  localState.readBookmarks.mockResolvedValue([]);
  localState.writeBookmarks.mockResolvedValue(true);
  localState.readLikedIds.mockResolvedValue(new Set());
});

describe('BookmarksScreen — listing', () => {
  it('invites the user to bookmark something when the list is empty', async () => {
    await renderBookmarks();
    expect(screen.getByText('No bookmarks yet')).toBeTruthy();
  });

  it('lists what is saved', async () => {
    localState.readBookmarks.mockResolvedValue([bookmark(1, 'Solar Dryer'), bookmark(2, 'Drip Kit')]);
    await renderBookmarks();
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
    expect(screen.getByText('Drip Kit')).toBeTruthy();
  });

  it('removes a bookmark when its bin is tapped', async () => {
    // A real store, because removal reads the saved list, writes the shortened
    // one, and then re-reads to refresh the screen.
    let saved = [bookmark(1, 'Solar Dryer'), bookmark(2, 'Drip Kit')];
    localState.readBookmarks.mockImplementation(async () => saved);
    localState.writeBookmarks.mockImplementation(async (next) => { saved = next; return true; });

    await renderBookmarks();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove bookmark on Solar Dryer'));
    });

    expect(saved.map((i) => i.id)).toEqual([2]);
    await waitFor(() => expect(screen.queryByText('Solar Dryer')).toBeNull());
    expect(screen.getByText('Drip Kit')).toBeTruthy();
  });

  it('does not remove anything when the write fails', async () => {
    localState.readBookmarks.mockResolvedValue([bookmark(1, 'Solar Dryer')]);
    localState.writeBookmarks.mockResolvedValue(false);
    await renderBookmarks();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove bookmark on Solar Dryer'));
    });
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
  });
});

/*
 * Liking is not driven through this screen's detail drawer here. The invariant
 * that used to be broken — this screen incremented the thumbs-up count on every
 * tap, with no record of having already liked — belongs to the shared hook the
 * screen now delegates to, and is asserted directly against it in
 * useInnovationInteractions.test.js ("never increments twice for the same
 * device"). Reaching it through the drawer's markup would test the drawer.
 */

describe('BookmarksScreen — comparison', () => {
  it('offers comparison only once two are saved', async () => {
    localState.readBookmarks.mockResolvedValue([bookmark(1, 'One')]);
    await renderBookmarks();
    expect(screen.queryByText(/^Compare/)).toBeNull();
  });

  it('enables comparison once exactly two are picked', async () => {
    localState.readBookmarks.mockResolvedValue([
      bookmark(1, 'One'), bookmark(2, 'Two'), bookmark(3, 'Three'),
    ]);
    await renderBookmarks();
    expect(screen.getByText('Compare (0/2)')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByLabelText('Add One to comparison')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Add Two to comparison')); });
    expect(screen.getByText('Compare (2/2)')).toBeTruthy();
  });

  it('refuses a third selection', async () => {
    localState.readBookmarks.mockResolvedValue([
      bookmark(1, 'One'), bookmark(2, 'Two'), bookmark(3, 'Three'),
    ]);
    await renderBookmarks();
    await act(async () => { fireEvent.press(screen.getByLabelText('Add One to comparison')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Add Two to comparison')); });

    expect(screen.getByLabelText('Add Three to comparison').props.accessibilityState.disabled).toBe(true);
  });

  it('runs the comparison without demanding a client-side API key', async () => {
    // The screen used to refuse to call the service unless
    // EXPO_PUBLIC_OPENAI_API_KEY was set. That credential moved to the backend,
    // so the variable is unset in every correctly configured build and the
    // check disabled a feature that would have worked.
    delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    const { generateComparisonSummary } = require('../../src/services/aiSummary');
    localState.readBookmarks.mockResolvedValue([bookmark(1, 'One'), bookmark(2, 'Two')]);
    await renderBookmarks();

    await act(async () => { fireEvent.press(screen.getByLabelText('Add One to comparison')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Add Two to comparison')); });
    await act(async () => { fireEvent.press(screen.getByText('Compare (2/2)')); });

    await waitFor(() => expect(generateComparisonSummary).toHaveBeenCalled());
    expect(screen.queryByText(/Missing API key/)).toBeNull();
  });
});

describe('ComparisonRow', () => {
  it('shows an em dash for a side with nothing to say', () => {
    render(<ComparisonRow label="Where" a="" b="Kenya" />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('offers no expander when the value fits', () => {
    render(<ComparisonRow label="Where" a="Kenya" b="Peru" />);
    expect(screen.queryByText('more')).toBeNull();
  });

  it('offers an expander when a fuller value exists', () => {
    render(<ComparisonRow label="Types" a="App, Sensor…" b="Tool" aFull="App, Sensor, Platform" />);
    expect(screen.getByText('more')).toBeTruthy();
  });

  it('reveals the fuller value and can put it back', () => {
    render(<ComparisonRow label="Types" a="App, Sensor…" b="Tool" aFull="App, Sensor, Platform" />);
    fireEvent.press(screen.getByText('more'));
    expect(screen.getByText('App, Sensor, Platform')).toBeTruthy();

    fireEvent.press(screen.getByText('Show less'));
    expect(screen.getByText('App, Sensor…')).toBeTruthy();
  });

  it('expands each side independently', () => {
    // The state used to live in the parent keyed by `${label}-A`/`${label}-B`,
    // so every call site threaded four extra props to say this.
    render(
      <ComparisonRow
        label="Types"
        a="A short…" b="B short…"
        aFull="A much longer value" bFull="B much longer value"
      />
    );
    fireEvent.press(screen.getAllByText('more')[0]);
    expect(screen.getByText('A much longer value')).toBeTruthy();
    expect(screen.getByText('B short…')).toBeTruthy();
  });

  it('offers an expander for a long value even with no fuller version', () => {
    const long = 'x'.repeat(80);
    render(<ComparisonRow label="Where" a={long} b="Peru" />);
    expect(screen.getByText('more')).toBeTruthy();
  });
});
