import React from 'react';
import { render } from '@testing-library/react-native';
import ExploreMode from '../../src/screens/home/ExploreMode';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import useOnlineStatus from '../../src/hooks/useOnlineStatus';
import useExploreData from '../../src/hooks/useExploreData';

jest.mock('../../src/hooks/useOnlineStatus', () => jest.fn());
jest.mock('../../src/hooks/useExploreData', () => jest.fn());

/**
 * Explore reloads when the connection comes back.
 *
 * It used to load once on mount, so the saved figures (or the error, with
 * nothing saved) stayed up after reconnecting until the user left the tab.
 */

const A11Y = { reduceMotion: true, colorBlindMode: false, textSize: 'default', getScaledSize: (n) => n };

const load = jest.fn();

function explore() {
  return {
    loading: false,
    error: null,
    fromCache: false,
    stats: { innovations: 0, countries: 0, sdgs: 17 },
    mostAdvanced: [],
    topRegions: [],
    challengeCounts: {},
    typeCounts: {},
    countsReady: false,
    load,
  };
}

function screen() {
  return (
    <AccessibilityContext.Provider value={A11Y}>
      <ExploreMode interactions={{}} onOpenDrilldown={jest.fn()} />
    </AccessibilityContext.Provider>
  );
}

beforeEach(() => {
  load.mockReset();
  useExploreData.mockImplementation(explore);
});

test('reloads when the browser comes back online', () => {
  useOnlineStatus.mockReturnValue(false);
  const view = render(screen());
  expect(load).toHaveBeenCalledTimes(1);

  useOnlineStatus.mockReturnValue(true);
  view.rerender(screen());
  expect(load).toHaveBeenCalledTimes(2);
});

test('does not reload when the connection drops', () => {
  useOnlineStatus.mockReturnValue(true);
  const view = render(screen());
  expect(load).toHaveBeenCalledTimes(1);

  useOnlineStatus.mockReturnValue(false);
  view.rerender(screen());
  expect(load).toHaveBeenCalledTimes(1);
});
