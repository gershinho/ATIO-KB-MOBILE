import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ModePills from '../../src/components/ModePills';
import HelpEmptyState from '../../src/components/HelpEmptyState';
import ResultsList from '../../src/components/ResultsList';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';

const A11Y = {
  reduceMotion: true,
  colorBlindMode: false,
  textSize: 'default',
  getScaledSize: (n) => n,
};

function withA11y(ui, overrides = {}) {
  return render(
    <AccessibilityContext.Provider value={{ ...A11Y, ...overrides }}>{ui}</AccessibilityContext.Provider>
  );
}

describe('ModePills', () => {
  it('marks the active mode as selected for assistive technology', () => {
    render(<ModePills mode="search" onSelect={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Search' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Explore' }).props.accessibilityState.selected).toBe(false);
  });

  it('reports which pill was pressed', () => {
    const onSelect = jest.fn();
    render(<ModePills mode="search" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Explore'));
    expect(onSelect).toHaveBeenCalledWith('explore');
  });

  it('reports the active pill too, so re-selecting is still an event', () => {
    // The drilldown relies on this: tapping Explore while inside one steps back out.
    const onSelect = jest.fn();
    render(<ModePills mode="explore" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Explore'));
    expect(onSelect).toHaveBeenCalledWith('explore');
  });
});

describe('HelpEmptyState', () => {
  const items = [
    { id: 1, title: 'National Helpline' },
    { id: 2, title: 'Local Support Line' },
  ];

  const renderHelp = (props = {}, a11y = {}) =>
    withA11y(
      <HelpEmptyState
        title="No solutions found"
        subtitle="Below are hotlines that may help."
        loading={false}
        items={items}
        isBookmarked={() => false}
        onExpand={jest.fn()}
        onToggleBookmark={jest.fn()}
        {...props}
      />,
      a11y
    );

  it('shows the wording the caller supplied', () => {
    renderHelp();
    expect(screen.getByText('No solutions found')).toBeTruthy();
    expect(screen.getByText('Below are hotlines that may help.')).toBeTruthy();
  });

  it('lists every help item', () => {
    renderHelp();
    expect(screen.getByText('National Helpline')).toBeTruthy();
    expect(screen.getByText('Local Support Line')).toBeTruthy();
  });

  it('shows a spinner instead of the list while loading', () => {
    renderHelp({ loading: true });
    expect(screen.queryByText('National Helpline')).toBeNull();
  });

  it('still renders its heading with no items to show', () => {
    renderHelp({ items: [] });
    expect(screen.getByText('Seek further help')).toBeTruthy();
  });

  it('opens the item that was expanded', () => {
    const onExpand = jest.fn();
    renderHelp({ onExpand });
    fireEvent.press(screen.getByLabelText('Open National Helpline'));
    expect(onExpand).toHaveBeenCalledWith(items[0]);
  });

  it('bookmarks the item that was tapped', () => {
    const onToggleBookmark = jest.fn();
    renderHelp({ onToggleBookmark });
    fireEvent.press(screen.getByLabelText('Bookmark Local Support Line'));
    expect(onToggleBookmark).toHaveBeenCalledWith(items[1]);
  });

  it('offers to remove a bookmark that is already set', () => {
    renderHelp({ isBookmarked: (id) => id === 1 });
    expect(screen.getByLabelText('Remove bookmark on National Helpline')).toBeTruthy();
    expect(screen.getByLabelText('Bookmark Local Support Line')).toBeTruthy();
  });

  it('honours the text-size setting', () => {
    // Neither of the two inline copies this replaced scaled with the setting.
    renderHelp({}, { getScaledSize: (n) => n * 2 });
    expect(screen.getByText('No solutions found').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 34 })])
    );
  });
});

describe('ResultsList', () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const renderCard = (item) => <Text>{`Row ${item.id}`}</Text>;

  it('renders a card per row', () => {
    render(<ResultsList data={rows} renderCard={renderCard} onEndReached={jest.fn()} />);
    expect(screen.getByText('Row 1')).toBeTruthy();
    expect(screen.getByText('Row 3')).toBeTruthy();
  });

  it('shows the empty state instead when there is nothing to list', () => {
    render(
      <ResultsList
        data={[]}
        renderCard={renderCard}
        emptyState={<Text>Nothing here</Text>}
        onEndReached={jest.fn()}
      />
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('shows the footer only while more is coming', () => {
    const { rerender } = render(
      <ResultsList data={rows} renderCard={renderCard} loadingMore={false} onEndReached={jest.fn()} />
    );
    expect(screen.queryByText('Loading more solutions...')).toBeNull();

    rerender(
      <ResultsList data={rows} renderCard={renderCard} loadingMore onEndReached={jest.fn()} />
    );
    expect(screen.getByText('Loading more solutions...')).toBeTruthy();
  });

  it('lets the empty state fill the viewport rather than collapsing to the top', () => {
    const { UNSAFE_getByType } = render(
      <ResultsList data={[]} renderCard={renderCard} emptyState={<Text>None</Text>} onEndReached={jest.fn()} />
    );
    const { FlatList } = require('react-native');
    const contentStyle = UNSAFE_getByType(FlatList).props.contentContainerStyle;
    expect(contentStyle).toEqual(expect.objectContaining({ flexGrow: 1 }));
  });
});
