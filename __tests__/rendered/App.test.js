import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import flushEffects from '../setup/flushEffects';

// App renders its own SafeAreaProvider with no initialMetrics. On a device the
// insets arrive from a native layout event, which never fires under the test
// renderer — so without this the provider holds its children back forever and
// the tree renders empty. Supplying constant insets is the whole fix; the
// library's own jest mock is a default-exported .tsx, which is more moving
// parts than this needs.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    SafeAreaInsetsContext: { Consumer: ({ children }) => children(insets) },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

// eslint-disable-next-line import/first
import App from '../../App';

/**
 * The root component, mounted for real.
 *
 * Nothing rendered App.js. Every other suite starts one screen below it with
 * contexts hand-supplied, so the three real providers, the navigator and the
 * four tab registrations were only ever exercised on a device. That is the seam
 * a large refactor is most likely to break and the least likely to be noticed:
 * a screen that fails to mount inside the real provider tree still passes every
 * test that mounts it with a stub tree.
 *
 * This is a smoke test and says so. It asserts the app comes up, all four tabs
 * exist, and each one renders when selected. It cannot replace opening the app
 * on a phone — the file-system and SQLite layers are mocked here — but it does
 * mean a broken import, a missing export, a provider that throws on mount or a
 * screen that crashes on first render fails the suite rather than the build.
 */

const TABS = ['Home', 'Bookmarks', 'Downloads', 'Settings'];

async function renderApp() {
  const utils = render(<App />);
  await flushEffects();
  return utils;
}

describe('App — the real provider tree and navigator', () => {
  it('mounts without throwing', async () => {
    await renderApp();
    expect(screen.toJSON()).toBeTruthy();
  });

  it('registers all four tabs', async () => {
    await renderApp();
    for (const tab of TABS) {
      expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    }
  });

  it('starts on Home', async () => {
    await renderApp();
    // The Home hero's submit control, which only exists on the Home screen.
    expect(screen.getByText('Search Solutions')).toBeTruthy();
  });

  it.each(TABS)('renders the %s tab when it is selected', async (tab) => {
    await renderApp();
    await flushEffects(1);

    const target = screen.getAllByText(tab)[0];
    fireEvent.press(target);
    await flushEffects();

    // Getting here without a throw is the assertion: a screen that crashes on
    // mount inside the real tree takes the whole render down.
    expect(screen.toJSON()).toBeTruthy();
  });

  it('survives being navigated across every tab in sequence', async () => {
    await renderApp();
    for (const tab of TABS) {
      fireEvent.press(screen.getAllByText(tab)[0]);
      await flushEffects(2);
    }
    expect(screen.toJSON()).toBeTruthy();
  });
});
