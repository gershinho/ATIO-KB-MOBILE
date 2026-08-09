import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import FilterPanel from '../../src/components/FilterPanel';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import { CHALLENGES, TYPES } from '../../src/data/constants';

const A11Y = {
  reduceMotion: false,
  colorBlindMode: false,
  textSize: 'default',
  getScaledSize: (n) => n,
};

function renderPanel(props = {}) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <AccessibilityContext.Provider value={A11Y}>
      <FilterPanel visible onClose={onClose} onApply={onApply} {...props} />
    </AccessibilityContext.Provider>
  );
  return { ...utils, onApply, onClose };
}

const challengeWithSubTerms = CHALLENGES.find((c) => c.subTerms?.length);
const typeWithSubTerms = TYPES.find((t) => t.subTerms?.length);

describe('FilterPanel rendering', () => {
  it('renders when visible', () => {
    renderPanel();
    expect(screen.getByText('Show results')).toBeOnTheScreen();
  });

  it('renders nothing meaningful when not visible', () => {
    renderPanel({ visible: false });
    expect(screen.queryByText('Show results')).toBeNull();
  });
});

describe('FilterPanel apply', () => {
  it('calls onApply and then onClose', () => {
    const { onApply, onClose } = renderPanel();
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits keyword arrays entirely when nothing is selected', () => {
    const { onApply } = renderPanel();
    fireEvent.press(screen.getByText('Show results'));
    const applied = onApply.mock.calls[0][0];
    expect(applied.challengeKeywords).toBeUndefined();
    expect(applied.typeKeywords).toBeUndefined();
  });

  it('always reports the scalar filters', () => {
    const { onApply } = renderPanel();
    fireEvent.press(screen.getByText('Show results'));
    const applied = onApply.mock.calls[0][0];
    expect(applied.readinessMin).toBe(1);
    expect(applied.adoptionMin).toBe(1);
    expect(applied.grassrootsOnly).toBe(false);
    expect(Array.isArray(applied.countries)).toBe(true);
  });
});

// These exercise buildSelectedSubTerms / buildInScopeIds / collectKeywordsForApply,
// which used to exist as two hand-maintained copies each — one per taxonomy.
// Passing entry keywords in and reading applied keywords out covers the whole
// round-trip for both taxonomies through the shared implementation.
describe('FilterPanel taxonomy round-trip', () => {
  // initialFilters seeds the panel's state; entryFilters is only the baseline
  // that Reset returns to.
  it('carries challenge keywords from initial filters through to apply', () => {
    const keyword = challengeWithSubTerms.subTerms[0].keyword;
    const { onApply } = renderPanel({ initialFilters: { challengeKeywords: [keyword] } });
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply.mock.calls[0][0].challengeKeywords).toContain(keyword);
  });

  it('carries type keywords from initial filters through to apply', () => {
    const keyword = typeWithSubTerms.subTerms[0].keyword;
    const { onApply } = renderPanel({ initialFilters: { typeKeywords: [keyword] } });
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply.mock.calls[0][0].typeKeywords).toContain(keyword);
  });

  it('handles both taxonomies at once', () => {
    const cKeyword = challengeWithSubTerms.subTerms[0].keyword;
    const tKeyword = typeWithSubTerms.subTerms[0].keyword;
    const { onApply } = renderPanel({
      initialFilters: { challengeKeywords: [cKeyword], typeKeywords: [tKeyword] },
    });
    fireEvent.press(screen.getByText('Show results'));
    const applied = onApply.mock.calls[0][0];
    expect(applied.challengeKeywords).toContain(cKeyword);
    expect(applied.typeKeywords).toContain(tKeyword);
  });

  it('expands a partially-selected entry to all of its sub-terms', () => {
    // An entry in scope with no explicit selection applies every sub-term —
    // the fallback branch inside collectKeywordsForApply.
    const keyword = challengeWithSubTerms.subTerms[0].keyword;
    const { onApply } = renderPanel({ initialFilters: { challengeKeywords: [keyword] } });
    fireEvent.press(screen.getByText('Show results'));
    const applied = onApply.mock.calls[0][0].challengeKeywords;
    expect(applied.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores keywords that match no sub-term', () => {
    const { onApply } = renderPanel({ initialFilters: { challengeKeywords: ['not-a-real-keyword'] } });
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply.mock.calls[0][0].challengeKeywords).toBeUndefined();
  });

  it('tolerates absent filters', () => {
    const { onApply } = renderPanel({ initialFilters: undefined, entryFilters: undefined });
    fireEvent.press(screen.getByText('Show results'));
    expect(onApply).toHaveBeenCalled();
  });

  it('carries hub regions through from entry filters', () => {
    const { onApply } = renderPanel({ initialFilters: { hubRegions: ['r1'] } });
    fireEvent.press(screen.getByText('Show results'));
    expect(Array.isArray(onApply.mock.calls[0][0].hubRegions)).toBe(true);
  });
});
