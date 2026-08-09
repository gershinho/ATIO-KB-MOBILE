import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

function renderDrawer(props = {}) {
  return render(
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
}

describe('DetailDrawer — reads the record, not restated props', () => {
  /**
   * The drawer used to take thumbsUpCount, commentCount and downloadedAt as
   * separate props alongside the `innovation` they are fields of, so all three
   * call sites restated the same mapping through null-guarding ternaries. These
   * pin the narrower contract: pass the record and the counts come with it.
   */
  it('shows both counts off the record', () => {
    renderDrawer({ onThumbsUp: jest.fn(), onComments: jest.fn() });
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows the downloaded stamp off the record', () => {
    renderDrawer({ innovation: record({ downloadedAt: Date.parse('2026-03-04T10:00:00Z') }) });
    expect(screen.getByText(/^Downloaded: /)).toBeTruthy();
  });

  it('omits the downloaded stamp when the record has no timestamp', () => {
    renderDrawer();
    expect(screen.queryByText(/^Downloaded: /)).toBeNull();
  });

  it('takes isBookmarked and isLiked as id lookups', () => {
    const isBookmarked = jest.fn(() => true);
    const isLiked = jest.fn(() => true);
    renderDrawer({ isBookmarked, isLiked, onBookmark: jest.fn(), onThumbsUp: jest.fn() });
    expect(isBookmarked).toHaveBeenCalledWith(1);
    expect(isLiked).toHaveBeenCalledWith(1);
  });

  it('renders without any of the optional callbacks', () => {
    renderDrawer();
    expect(screen.getByText('Solar Dryer')).toBeTruthy();
  });

  it('renders the record header once, not twice', () => {
    // The collapsed and expanded branches each had their own copy of the title,
    // meta, country and downloaded rows.
    renderDrawer();
    expect(screen.getAllByText('Solar Dryer')).toHaveLength(1);
  });
});
