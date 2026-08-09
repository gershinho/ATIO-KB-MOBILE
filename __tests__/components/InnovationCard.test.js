import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import InnovationCard from '../../src/components/InnovationCard';
import { DownloadCompleteContext } from '../../src/context/DownloadCompleteContext';

const CONTEXT = {
  downloadingInnovationId: null,
  drainingInnovationId: null,
  justCompletedInnovationId: null,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

const INNOVATION = { id: 7, title: 'Solar Drip Irrigation' };

function renderCard(props = {}, context = {}) {
  return render(
    <DownloadCompleteContext.Provider value={{ ...CONTEXT, ...context }}>
      <InnovationCard
        title="Solar Drip Irrigation"
        countries={['Kenya', 'Uganda']}
        description="Low-cost irrigation for smallholder plots."
        cost="low"
        complexity="simple"
        innovation={INNOVATION}
        {...props}
      />
    </DownloadCompleteContext.Provider>
  );
}

describe('InnovationCard rendering', () => {
  it('renders the title and description', () => {
    renderCard();
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
    expect(screen.getByText('Low-cost irrigation for smallholder plots.')).toBeOnTheScreen();
  });

  it('labels a low cost as "$ Low"', () => {
    renderCard({ cost: 'low' });
    expect(screen.getByText('$ Low')).toBeOnTheScreen();
  });

  it('labels a high cost as "$$$ High"', () => {
    renderCard({ cost: 'high' });
    expect(screen.getByText('$$$ High')).toBeOnTheScreen();
  });

  it('falls back to "$$ Moderate" for med or missing cost', () => {
    renderCard({ cost: 'med' });
    expect(screen.getByText('$$ Moderate')).toBeOnTheScreen();
  });

  it('capitalises the complexity label', () => {
    renderCard({ complexity: 'advanced' });
    expect(screen.getByText('Advanced')).toBeOnTheScreen();
  });

  it('joins two countries in full', () => {
    renderCard({ countries: ['Kenya', 'Uganda'] });
    expect(screen.getByText('Kenya, Uganda')).toBeOnTheScreen();
  });

  it('truncates three or more countries with a +N suffix', () => {
    renderCard({ countries: ['Kenya', 'Uganda', 'Tanzania', 'Rwanda'] });
    expect(screen.getByText('Kenya, Uganda +2')).toBeOnTheScreen();
  });

  it('accepts a comma-separated country string as well as an array', () => {
    renderCard({ countries: 'Kenya, Uganda, Tanzania' });
    expect(screen.getByText('Kenya, Uganda +1')).toBeOnTheScreen();
  });

  it('renders without countries', () => {
    renderCard({ countries: undefined });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });

  it('shows the thumbs-up count', () => {
    renderCard({ thumbsUpCount: 12 });
    expect(screen.getByText('12')).toBeOnTheScreen();
  });

  it('shows the comment count only when a comments handler is supplied', () => {
    renderCard({ commentCount: 5, onComments: jest.fn() });
    expect(screen.getByLabelText('Comments (5)')).toBeOnTheScreen();
  });

  it('hides the comments control when no handler is supplied', () => {
    renderCard({ commentCount: 5, onComments: undefined });
    expect(screen.queryByLabelText(/^Comments/)).toBeNull();
  });

  it('hides the icon row when showTopIcons is false', () => {
    renderCard({ showTopIcons: false });
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

  it('renders with no innovation object at all', () => {
    renderCard({ innovation: undefined }, { downloadingInnovationId: 7 });
    expect(screen.getByText('Solar Drip Irrigation')).toBeOnTheScreen();
  });
});
