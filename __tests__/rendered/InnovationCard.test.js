import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import InnovationCard from '../../src/components/InnovationCard';
import { DownloadContext } from '../../src/context/DownloadContext';

const CONTEXT = {
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

const INNOVATION = {
  id: 7,
  title: 'Solar Drip Irrigation',
  countries: ['Kenya', 'Uganda'],
  shortDescription: 'Low-cost irrigation for smallholder plots.',
  cost: 'low',
  complexity: 'simple',
};

/**
 * The card reads its display fields from `innovation`, so tests vary the record
 * rather than passing parallel props. `overrides` patches that record.
 */
function renderCard({ overrides = {}, ...props } = {}, context = {}) {
  return render(
    <DownloadContext.Provider value={{ ...CONTEXT, ...context }}>
      <InnovationCard innovation={{ ...INNOVATION, ...overrides }} {...props} />
    </DownloadContext.Provider>
  );
}

describe('InnovationCard rendering', () => {
  it('renders the title and description', () => {
    renderCard();
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
    expect(screen.getByText('Low-cost irrigation for smallholder plots.')).toBeOnTheScreen();
  });

  it('labels a low cost as "$ Low"', () => {
    renderCard({ overrides: { cost: 'low' } });
    expect(screen.getByText('$ Low')).toBeOnTheScreen();
  });

  it('labels a high cost as "$$$ High"', () => {
    renderCard({ overrides: { cost: 'high' } });
    expect(screen.getByText('$$$ High')).toBeOnTheScreen();
  });

  it('falls back to "$$ Moderate" for med or missing cost', () => {
    renderCard({ overrides: { cost: 'med' } });
    expect(screen.getByText('$$ Moderate')).toBeOnTheScreen();
  });

  it('capitalises the complexity label', () => {
    renderCard({ overrides: { complexity: 'advanced' } });
    expect(screen.getByText('Advanced')).toBeOnTheScreen();
  });

  it('joins two countries in full', () => {
    renderCard({ overrides: { countries: ['Kenya', 'Uganda'] } });
    expect(screen.getByText('Kenya, Uganda')).toBeOnTheScreen();
  });

  it('truncates three or more countries with a +N suffix', () => {
    renderCard({ overrides: { countries: ['Kenya', 'Uganda', 'Tanzania', 'Rwanda'] } });
    expect(screen.getByText('Kenya, Uganda +2')).toBeOnTheScreen();
  });

  it('ignores a non-array countries value rather than splitting a string', () => {
    // Callers used to pre-join the array into a string that the card then split
    // apart again; innovation.countries is the only accepted shape now, and a
    // non-array falls through to the region.
    renderCard({ overrides: { countries: 'Kenya, Uganda', region: 'East Africa' } });
    expect(screen.getByText('East Africa')).toBeOnTheScreen();
  });

  it('renders without countries', () => {
    renderCard({ overrides: { countries: undefined } });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });

  it('shows the thumbs-up count', () => {
    renderCard({ overrides: { thumbsUpCount: 12 } });
    expect(screen.getByText('12')).toBeOnTheScreen();
  });

  it('shows the comment count only when a comments handler is supplied', () => {
    renderCard({ overrides: { commentCount: 5 }, onComments: jest.fn() });
    expect(screen.getByLabelText('Comments (5)')).toBeOnTheScreen();
  });

  it('hides the comments control when no handler is supplied', () => {
    renderCard({ overrides: { commentCount: 5 }, onComments: undefined });
    expect(screen.queryByLabelText(/^Comments/)).toBeNull();
  });

  it('hides the icon row and download control when showActions is false', () => {
    renderCard({ showActions: false });
    expect(screen.queryByLabelText('Like')).toBeNull();
    expect(screen.queryByLabelText('Add bookmark')).toBeNull();
  });
});

describe('InnovationCard accessibility labels', () => {
  it('labels the bookmark control by state', () => {
    renderCard({ isBookmarked: false });
    expect(screen.getByLabelText('Add bookmark')).toBeOnTheScreen();
    screen.unmount();
    renderCard({ isBookmarked: true });
    expect(screen.getByLabelText('Remove bookmark')).toBeOnTheScreen();
  });

  it('labels the like control by state', () => {
    renderCard({ isLiked: false });
    expect(screen.getByLabelText('Like')).toBeOnTheScreen();
    screen.unmount();
    renderCard({ isLiked: true });
    expect(screen.getByLabelText('Remove like')).toBeOnTheScreen();
  });
});

describe('InnovationCard interaction', () => {
  it('passes the innovation to onThumbsUp', () => {
    const onThumbsUp = jest.fn();
    renderCard({ onThumbsUp });
    fireEvent.press(screen.getByLabelText('Like'));
    expect(onThumbsUp).toHaveBeenCalledWith(INNOVATION);
  });

  it('does not throw when thumbs-up is pressed with no handler', () => {
    renderCard({ onThumbsUp: undefined });
    expect(() => fireEvent.press(screen.getByLabelText('Like'))).not.toThrow();
  });

  it('passes the innovation to onBookmark', () => {
    const onBookmark = jest.fn();
    renderCard({ onBookmark });
    fireEvent.press(screen.getByLabelText('Add bookmark'));
    expect(onBookmark).toHaveBeenCalledWith(INNOVATION);
  });

  it('passes the innovation to onComments', () => {
    const onComments = jest.fn();
    renderCard({ onComments });
    fireEvent.press(screen.getByLabelText('Comments (0)'));
    expect(onComments).toHaveBeenCalledWith(INNOVATION);
  });
});

describe('InnovationCard download state', () => {
  it('renders while a different innovation is downloading', () => {
    renderCard({}, { downloadingInnovationId: 999 });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });

  it('renders while this innovation is downloading', () => {
    renderCard({}, { downloadingInnovationId: 7 });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });

  it('renders while this innovation is draining', () => {
    renderCard({}, { drainingInnovationId: 7 });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });

  it('renders without crashing when there is no innovation at all', () => {
    expect(() =>
      render(
        <DownloadContext.Provider value={{ ...CONTEXT, downloadingInnovationId: 7 }}>
          <InnovationCard innovation={undefined} />
        </DownloadContext.Provider>
      )
    ).not.toThrow();
  });
});
