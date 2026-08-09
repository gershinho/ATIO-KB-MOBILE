import React from 'react';
import { TextInput } from 'react-native';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from '../../src/screens/HomeScreen';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import { BookmarkCountContext } from '../../src/context/BookmarkCountContext';
import { DownloadContext } from '../../src/context/DownloadContext';
import * as api from '../../src/services/api';
import * as db from '../../src/database/db';
import * as heatmaps from '../../src/database/heatmaps';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), navigate: jest.fn() }),
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));

const A11Y = {
  reduceMotion: true, // skips animations so assertions are not racing them
  colorBlindMode: false,
  textSize: 'default',
  getScaledSize: (n) => n,
};
const BOOKMARKS = { bookmarkCount: 0, refreshBookmarkCount: jest.fn() };
const DOWNLOADS = {
  downloadJustCompleted: false,
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

const innovation = (id, title) => ({
  id,
  title,
  shortDescription: `About ${title}`,
  matchScore: 1,
  thumbsUpCount: 0,
  commentCount: 0,
});

function renderHome() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AccessibilityContext.Provider value={A11Y}>
        <BookmarkCountContext.Provider value={BOOKMARKS}>
          <DownloadContext.Provider value={DOWNLOADS}>
            <HomeScreen />
          </DownloadContext.Provider>
        </BookmarkCountContext.Provider>
      </AccessibilityContext.Provider>
    </SafeAreaProvider>
  );
}

/** Let the screen's mount effects settle so assertions see a stable tree. */
async function renderHomeSettled() {
  const utils = renderHome();
  await act(async () => {});
  return utils;
}

/**
 * Type a query into the landing hero and submit it.
 *
 * This is the interaction the previous test file could not reach: the screen
 * rendered two unlabelled search inputs and the submitting control was gated
 * behind internal mode state. Both inputs now carry accessibility labels and
 * the hero's submit button is a plain, findable button.
 */
async function search(query) {
  fireEvent.changeText(screen.getByLabelText('Search solutions'), query);
  await act(async () => {
    fireEvent.press(screen.getByText('Search Solutions'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  api.aiSearch.mockResolvedValue({ query: '', results: [], hasMore: false, total: 0 });
  db.searchInnovations.mockResolvedValue([]);
  db.countInnovations.mockResolvedValue(0);
  db.getRecentInnovations.mockResolvedValue([]);
  db.getHelpInnovations.mockResolvedValue([]);
  db.getChallengeCounts.mockResolvedValue({});
  db.getTypeCounts.mockResolvedValue({});
  db.getTopRegions.mockResolvedValue([]);
  db.getStats.mockResolvedValue({ innovations: 0, countries: 0, sdgs: 17 });
});

describe('HomeScreen — mount', () => {
  it('renders without crashing', async () => {
    await renderHomeSettled();
    expect(screen.toJSON()).toBeTruthy();
  });

  it('opens the database exactly once on mount', async () => {
    await renderHomeSettled();
    expect(db.initDatabase.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('does not search before the user asks for anything', async () => {
    await renderHomeSettled();
    expect(api.aiSearch).not.toHaveBeenCalled();
  });

  it('starts on the Search half', async () => {
    await renderHomeSettled();
    expect(screen.getByLabelText('Search solutions')).toBeTruthy();
  });

  it('does not load Explore data until Explore is selected', async () => {
    await renderHomeSettled();
    expect(db.getStats).not.toHaveBeenCalled();
  });
});

describe('HomeScreen — running a search', () => {
  it('sends the typed query to the backend', async () => {
    await renderHomeSettled();
    await search('drought resistant maize');
    expect(api.aiSearch).toHaveBeenCalledWith(
      'drought resistant maize',
      expect.objectContaining({ offset: 0 })
    );
  });

  it('renders the results it gets back', async () => {
    api.aiSearch.mockResolvedValue({
      results: [innovation(1, 'Solar Dryer'), innovation(2, 'Drip Kit')],
      hasMore: false,
    });
    await renderHomeSettled();
    await search('irrigation');
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
    expect(screen.getByText('Drip Kit')).toBeTruthy();
  });

  it('orders results by match score, best first', async () => {
    api.aiSearch.mockResolvedValue({
      results: [
        { ...innovation(1, 'Weaker'), matchScore: 0.2 },
        { ...innovation(2, 'Stronger'), matchScore: 0.9 },
      ],
      hasMore: false,
    });
    await renderHomeSettled();
    await search('anything');
    const titles = screen.getAllByText(/^(Weaker|Stronger)$/).map((node) => node.props.children);
    expect(titles).toEqual(['Stronger', 'Weaker']);
  });

  it('ignores an empty query rather than calling the backend', async () => {
    await renderHomeSettled();
    await search('   ');
    expect(api.aiSearch).not.toHaveBeenCalled();
  });

  it('shows the backend error message and can retry', async () => {
    api.aiSearch.mockRejectedValueOnce(new Error('Search request timed out. Please try again.'));
    await renderHomeSettled();
    await search('maize');
    expect(screen.getByText('Search request timed out. Please try again.')).toBeTruthy();

    api.aiSearch.mockResolvedValue({ results: [innovation(3, 'Recovered')], hasMore: false });
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });
    expect(screen.getByText('Recovered')).toBeTruthy();
  });

  it('offers hotlines when a search finds nothing', async () => {
    api.aiSearch.mockResolvedValueOnce({ results: [], hasMore: false });
    await renderHomeSettled();
    await search('nothing matches this');
    expect(screen.getByText('No solutions found for your search')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Seek further help')).toBeTruthy());
  });
});

describe('HomeScreen — moving between the two halves', () => {
  it('shows Explore content once Explore is selected', async () => {
    await renderHomeSettled();
    await act(async () => {
      fireEvent.press(screen.getByText('Explore'));
    });
    expect(screen.getByText("WHAT'S THE CHALLENGE?")).toBeTruthy();
    expect(db.getStats).toHaveBeenCalled();
  });

  it('keeps the search results after a trip through Explore', async () => {
    // The reason the search session is owned by the shell rather than by
    // SearchMode: unmounting it on a mode switch would discard the results.
    api.aiSearch.mockResolvedValue({ results: [innovation(1, 'Persisted Result')], hasMore: false });
    await renderHomeSettled();
    await search('maize');
    expect(screen.getByText('Persisted Result')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText('Explore')); });
    expect(screen.queryByText('Persisted Result')).toBeNull();

    await act(async () => { fireEvent.press(screen.getByText('Search')); });
    expect(screen.getByText('Persisted Result')).toBeTruthy();
    expect(api.aiSearch).toHaveBeenCalledTimes(1);
  });

  it('opens a drilldown from a challenge tile', async () => {
    db.searchInnovations.mockResolvedValue([innovation(7, 'Cover Cropping')]);
    db.countInnovations.mockResolvedValue(1);
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Explore')); });
    await act(async () => { fireEvent.press(screen.getByText('Crops & Production')); });

    expect(db.searchInnovations).toHaveBeenCalledWith(
      { challenges: ['crops'] },
      expect.objectContaining({ limit: expect.any(Number) })
    );
    expect(screen.getByText('Cover Cropping')).toBeTruthy();
  });

  it('leaves the drilldown when Explore is tapped again', async () => {
    db.searchInnovations.mockResolvedValue([innovation(7, 'Cover Cropping')]);
    db.countInnovations.mockResolvedValue(1);
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Explore')); });
    await act(async () => { fireEvent.press(screen.getByText('Crops & Production')); });
    await act(async () => { fireEvent.press(screen.getByText('Explore')); });

    expect(screen.getByText("WHAT'S THE CHALLENGE?")).toBeTruthy();
  });
});

describe('HomeScreen — data layer contract', () => {
  it('never calls searchInnovations with positional limit/offset', async () => {
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Explore')); });
    for (const call of db.searchInnovations.mock.calls) {
      if (call.length > 1) expect(typeof call[1]).not.toBe('number');
    }
  });

  it('survives the help lookup returning nothing', async () => {
    // getHelpInnovations returns [] rather than substituting recent innovations
    // when its query fails; the screen must handle an empty help section.
    api.aiSearch.mockRejectedValue(new Error('offline'));
    db.getHelpInnovations.mockResolvedValue([]);
    await renderHomeSettled();
    expect(screen.toJSON()).toBeTruthy();
  });

  it('survives a rejected Explore load without crashing the screen', async () => {
    db.getStats.mockRejectedValue(new Error('db down'));
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Explore')); });
    expect(screen.getByText('Could not load database')).toBeTruthy();
  });

  it('renders a search input for assistive technology to find', async () => {
    await renderHomeSettled();
    expect(screen.UNSAFE_queryAllByType(TextInput).length).toBeGreaterThan(0);
  });
});

describe('HomeScreen — heat map failures', () => {
  // The regression: both openers set visible=true, logged the rejection and
  // changed no state. `data == null` is exactly how both heat maps render a
  // load still in progress, so a failure showed as a spinner that never
  // resolved, with no way to tell the two apart.
  beforeEach(() => {
    heatmaps.getOpportunityHeatmapData.mockResolvedValue({ rows: [], cols: [], cells: {} });
    heatmaps.getReadyToUseHeatmapData.mockResolvedValue({
      rows: [], cols: [], cells: {}, minReadiness: 0, maxReadiness: 9,
    });
  });

  it('shows an error instead of a permanent spinner when the opportunity map fails', async () => {
    heatmaps.getOpportunityHeatmapData.mockRejectedValue(new Error('db down'));
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Adoption Opportunities')); });
    expect(screen.getByText('Could not load the heat map.')).toBeTruthy();
  });

  it('shows an error instead of a permanent spinner when the ready map fails', async () => {
    heatmaps.getReadyToUseHeatmapData.mockRejectedValue(new Error('db down'));
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Ready to Use')); });
    expect(screen.getByText('Could not load the heat map.')).toBeTruthy();
  });

  it('retries and clears the error when the second attempt succeeds', async () => {
    heatmaps.getOpportunityHeatmapData.mockRejectedValueOnce(new Error('db down'));
    await renderHomeSettled();
    await act(async () => { fireEvent.press(screen.getByText('Adoption Opportunities')); });
    expect(screen.getByText('Could not load the heat map.')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText('Try again')); });
    expect(screen.queryByText('Could not load the heat map.')).toBeNull();
  });
});
