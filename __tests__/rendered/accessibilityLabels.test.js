import React from 'react';
import { render } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import flushEffects from '../setup/flushEffects';
import DetailDrawer from '../../src/components/DetailDrawer';
import CommentsModal from '../../src/components/CommentsModal';
import FilterPanel from '../../src/components/FilterPanel';
import { AccessibilityContext } from '../../src/context/AccessibilityContext';
import { DownloadContext } from '../../src/context/DownloadContext';

/**
 * Every control a screen reader can reach must say what it does.
 *
 * These three components between them held 42 touchables with no accessibility
 * props at all, while their sibling components annotated the identical icon-only
 * buttons — an odd gap in an app that ships a dedicated accessibility settings
 * screen. An icon with no label is announced as "button" and nothing else.
 *
 * This asserts the property rather than any particular wording, so it keeps
 * holding as controls are added.
 */

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

const INNOVATION = {
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
};

function wrap(children) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AccessibilityContext.Provider value={A11Y}>
        <DownloadContext.Provider value={DOWNLOADS}>{children}</DownloadContext.Provider>
      </AccessibilityContext.Provider>
    </SafeAreaProvider>
  );
}

/**
 * Every touchable that can be pressed must carry a non-empty label.
 *
 * Returns plain strings, not the nodes: a failed assertion on React test
 * instances makes Jest serialize a circular tree and blow the stack, which
 * turns a useful failure into an unreadable one.
 */
function unlabelledTouchables(utils) {
  return utils.UNSAFE_getAllByType(TouchableOpacity)
    .filter((node) => {
      const { onPress, accessibilityLabel, accessibilityElementsHidden } = node.props;
      if (!onPress) return false;
      if (accessibilityElementsHidden) return false;
      return !accessibilityLabel || String(accessibilityLabel).trim() === '';
    })
    .map((node, index) => {
      const style = node.props.style;
      const hint = Array.isArray(style) ? 'styled control' : typeof style;
      return `unlabelled touchable #${index + 1} (${hint})`;
    });
}

describe('every pressable control announces itself', () => {
  it('DetailDrawer', async () => {
    const utils = render(
      wrap(
        <DetailDrawer
          innovation={INNOVATION}
          visible
          startExpanded
          onClose={jest.fn()}
          onBookmark={jest.fn()}
          onDownload={jest.fn()}
          onThumbsUp={jest.fn()}
          onComments={jest.fn()}
          isBookmarked={() => false}
          isLiked={() => false}
        />
      )
    );
    await flushEffects();
    expect(unlabelledTouchables(utils)).toEqual([]);
  });

  it('CommentsModal', async () => {
    const utils = render(
      wrap(<CommentsModal visible innovation={INNOVATION} onClose={jest.fn()} />)
    );
    await flushEffects();
    expect(unlabelledTouchables(utils)).toEqual([]);
  });

  it('FilterPanel', async () => {
    const utils = render(
      wrap(<FilterPanel visible onClose={jest.fn()} onApply={jest.fn()} />)
    );
    await flushEffects();
    expect(unlabelledTouchables(utils)).toEqual([]);
  });
});
