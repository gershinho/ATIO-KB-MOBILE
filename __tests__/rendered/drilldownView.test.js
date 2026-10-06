import React from 'react';
import { render, screen } from '@testing-library/react-native';
import DrilldownView from '../../src/screens/home/DrilldownView';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import useCatalogProgress from '../../src/hooks/useCatalogProgress';
import useOnlineStatus from '../../src/hooks/useOnlineStatus';

jest.mock('../../src/hooks/useCatalogProgress', () => jest.fn());
jest.mock('../../src/hooks/useOnlineStatus', () => jest.fn());
// The panel is a modal with its own data loading, and none of it is under test.
jest.mock('../../src/components/FilterPanel', () => () => null);

/**
 * The drilldown's three ways of saying where its list came from: still being
 * prepared, saved on the device because the portal was unreachable, or saved
 * on the device because the browser is offline.
 */

const A11Y = { reduceMotion: true, colorBlindMode: false, textSize: 'default', getScaledSize: (n) => n };

const IDLE = { loading: false, rows: 0, total: null };

function drilldown(overrides = {}) {
  return {
    visible: true,
    title: 'Digital & ICT',
    icon: null,
    iconColor: '#000',
    source: 'type',
    results: [],
    count: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    fromCache: false,
    filters: { types: ['digital'] },
    entryFilters: {},
    open: jest.fn(),
    applyFilters: jest.fn(),
    loadMore: jest.fn(),
    close: jest.fn(),
    ...overrides,
  };
}

const interactions = { isBookmarked: () => false, openDrawer: jest.fn(), toggleBookmark: jest.fn() };

function view(props) {
  return (
    <AccessibilityContext.Provider value={A11Y}>
      <DrilldownView drilldown={props} interactions={interactions} help={{ items: [], loading: false }} onBack={jest.fn()} />
    </AccessibilityContext.Provider>
  );
}

beforeEach(() => {
  useCatalogProgress.mockReturnValue(IDLE);
  useOnlineStatus.mockReturnValue(true);
});

describe('waiting for the catalogue', () => {
  it('shows how far the first pass has got', () => {
    useCatalogProgress.mockReturnValue({ loading: true, rows: 3700, total: 6287 });
    render(view(drilldown({ loading: true })));
    expect(screen.getByText('3,700 of 6,287 solutions')).toBeTruthy();
  });

  it('counts up without a total until the portal has said how many there are', () => {
    useCatalogProgress.mockReturnValue({ loading: true, rows: 0, total: null });
    render(view(drilldown({ loading: true })));
    expect(screen.getByText('0 solutions so far')).toBeTruthy();
  });

  it('says nothing about the catalogue when the list is loading for another reason', () => {
    render(view(drilldown({ loading: true })));
    expect(screen.queryByText(/Preparing the catalogue/)).toBeNull();
  });
});

describe('a list answered from the device', () => {
  it('blames the portal, not the connection, when the browser is online', () => {
    render(view(drilldown({ fromCache: true, count: 35 })));
    expect(screen.getByText(/Could not reach the FAO catalogue/)).toBeTruthy();
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });

  it('says offline when the browser is', () => {
    useOnlineStatus.mockReturnValue(false);
    render(view(drilldown({ fromCache: true, count: 35 })));
    expect(screen.getByText(/You are offline/)).toBeTruthy();
  });
});

describe('reconnecting', () => {
  it('loads the slice again when the connection comes back', () => {
    const props = drilldown();
    useOnlineStatus.mockReturnValue(false);
    const rendered = render(view(props));
    expect(props.applyFilters).not.toHaveBeenCalled();

    useOnlineStatus.mockReturnValue(true);
    rendered.rerender(view(props));
    expect(props.applyFilters).toHaveBeenCalledWith(props.filters);
  });
});
