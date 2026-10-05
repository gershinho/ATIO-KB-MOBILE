import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import flushEffects from '../setup/flushEffects';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DetailDrawer from '../../src/components/DetailDrawer';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import { DownloadContext } from '../../src/context/DownloadContext';

const A11Y = {
  reduceMotion: true,
  colorBlindMode: false,
  textSize: 'default',
  getScaledSize: (n) => n,
};

const DOWNLOADS = {
  downloadJustCompleted: false,
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

const record = (over = {}) => ({
  id: 1,
  title: 'Solar Dryer',
  types: ['Equipment'],
  countries: ['Kenya'],
  region: 'East Africa',
  shortDescription: 'Dries produce.',
  readinessLevel: 4,
  adoptionLevel: 2,
  thumbsUpCount: 7,
  commentCount: 3,
  ...over,
});

/**
 * Render and let the mount effects settle.
 *
 * useInnovationBullets checks the cache and may call the backend, so a
 * synchronous render leaves setState calls landing after the test body — which
 * React reports as an unwrapped act() update and which makes the suite sensitive
 * to timing rather than to behaviour.
 */
async function renderDrawer(props = {}) {
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AccessibilityContext.Provider value={A11Y}>
        <DownloadContext.Provider value={DOWNLOADS}>
          <DetailDrawer innovation={record()} visible onClose={jest.fn()} startExpanded {...props} />
        </DownloadContext.Provider>
      </AccessibilityContext.Provider>
    </SafeAreaProvider>
  );
  await flushEffects();
  return utils;
}

describe('DetailDrawer — reads the record, not restated props', () => {
  /**
   * The drawer used to take thumbsUpCount, commentCount and downloadedAt as
   * separate props alongside the `innovation` they are fields of, so all three
   * call sites restated the same mapping through null-guarding ternaries. These
   * pin the narrower contract: pass the record and the counts come with it.
   */
  it('shows both counts off the record', async () => {
    await renderDrawer({ onThumbsUp: jest.fn(), onComments: jest.fn() });
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows the downloaded stamp off the record', async () => {
    await renderDrawer({ innovation: record({ downloadedAt: Date.parse('2026-03-04T10:00:00Z') }) });
    expect(screen.getByText(/^Downloaded: /)).toBeTruthy();
  });

  it('omits the downloaded stamp when the record has no timestamp', async () => {
    await renderDrawer();
    expect(screen.queryByText(/^Downloaded: /)).toBeNull();
  });

  it('takes isBookmarked and isLiked as id lookups', async () => {
    const isBookmarked = jest.fn(() => true);
    const isLiked = jest.fn(() => true);
    await renderDrawer({ isBookmarked, isLiked, onBookmark: jest.fn(), onThumbsUp: jest.fn() });
    expect(isBookmarked).toHaveBeenCalledWith(1);
    expect(isLiked).toHaveBeenCalledWith(1);
  });

  it('renders without any of the optional callbacks', async () => {
    await renderDrawer();
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
  });

  it('renders the record header once, not twice', async () => {
    // The collapsed and expanded branches each had their own copy of the title,
    // meta, country and downloaded rows.
    await renderDrawer();
    expect(screen.getAllByText('Solar Dryer')).toHaveLength(1);
  });
});

describe('a bookmark whose content was evicted', () => {
  /** What listPinned returns when the index entry outlived its content. */
  const placeholder = (over = {}) => ({
    id: 'uuid-1',
    title: 'Solar Dryer',
    availableOffline: false,
    shortDescription: '',
    longDescription: '',
    ...over,
  });

  it('says so, rather than showing a drawer of blanks', async () => {
    await renderDrawer({ innovation: placeholder() });
    expect(screen.getByText(/Not available offline/)).toBeTruthy();
  });

  it('offers a retry, and hands the record back when pressed', async () => {
    const onRetry = jest.fn();
    await renderDrawer({ innovation: placeholder(), onRetry });

    fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'uuid-1' }));
  });

  it('leaves the button out when the caller cannot retry', async () => {
    await renderDrawer({ innovation: placeholder() });
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows the title, which is all the index entry had', async () => {
    await renderDrawer({ innovation: placeholder() });
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
  });

  it('does not claim to be unavailable when the content is there', async () => {
    await renderDrawer({
      innovation: placeholder({ availableOffline: true, shortDescription: 'A solar dryer.' }),
    });
    expect(screen.queryByText(/Not available offline/)).toBeNull();
    expect(screen.getByText('A solar dryer.')).toBeTruthy();
  });

  it('does not claim to be unavailable for a record fetched live', async () => {
    // A live record carries no availableOffline flag at all, which is what
    // distinguishes it from a placeholder.
    await renderDrawer({ innovation: placeholder({ availableOffline: undefined }) });
    expect(screen.queryByText(/Not available offline/)).toBeNull();
  });
});
