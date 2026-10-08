import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import SearchMode from '../../src/screens/home/SearchMode';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';

/**
 * The "Refine your search" card on the results page.
 *
 * It closes when its input loses focus. On web, pressing the card's own
 * "Search Solutions" button takes focus first, so the card used to close and
 * unmount the button before the click landed, and the search never ran. Enter
 * did nothing either: a multiline input on web submits only with blurOnSubmit.
 */

const A11Y = { reduceMotion: true, colorBlindMode: false, textSize: 'default', getScaledSize: (n) => n };

function search(overrides = {}) {
  return {
    query: 'bakhabar kissan',
    updateQuery: jest.fn(),
    run: jest.fn(),
    results: [],
    loading: false,
    loadingMore: false,
    hasSearched: true,
    hasMore: false,
    fromCache: false,
    cachedTotal: 0,
    cacheNoMatch: false,
    error: null,
    speechUnavailable: true,
    isRecording: false,
    isTranscribing: false,
    toggleSpeech: jest.fn(),
    loadMore: jest.fn(),
    ...overrides,
  };
}

function view(props) {
  return (
    <AccessibilityContext.Provider value={A11Y}>
      <SearchMode
        interactions={{ isBookmarked: () => false, openDrawer: jest.fn(), toggleBookmark: jest.fn() }}
        help={{ items: [], loading: false }}
        searchBarExpanded
        onExpandSearch={jest.fn()}
        onOpenOpportunityHeatmap={jest.fn()}
        onOpenReadyHeatmap={jest.fn()}
        {...props}
      />
    </AccessibilityContext.Provider>
  );
}

it('runs the search when its button is pressed, though pressing it takes focus from the input', () => {
  const s = search();
  const onCollapseSearch = jest.fn();
  render(view({ search: s, onCollapseSearch }));

  const button = screen.getByText('Search Solutions');
  fireEvent(button, 'pressIn');
  // The browser blurs the input here, between the press starting and ending.
  fireEvent(screen.getByLabelText('Refine your search'), 'blur');
  fireEvent.press(button);

  expect(onCollapseSearch).not.toHaveBeenCalled();
  expect(s.run).toHaveBeenCalled();
});

it('still closes when focus leaves for anywhere else', () => {
  const onCollapseSearch = jest.fn();
  render(view({ search: search(), onCollapseSearch }));

  fireEvent(screen.getByLabelText('Refine your search'), 'blur');
  expect(onCollapseSearch).toHaveBeenCalled();
});

it('searches on Enter', () => {
  const s = search();
  render(view({ search: s, onCollapseSearch: jest.fn() }));

  const input = screen.getByLabelText('Refine your search');
  expect(input.props.blurOnSubmit).toBe(true);
  fireEvent(input, 'submitEditing');
  expect(s.run).toHaveBeenCalled();
});
