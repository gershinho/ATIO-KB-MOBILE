/**
 * The shared mocks must still match the modules they stand in for.
 *
 * renderedSetup.js declares literal jest.mock factories for five real modules.
 * Nothing checked that the fakes still had the same exports as the originals, so
 * renaming or adding a data-layer function left every screen test passing
 * against a mock of a module that no longer exists in that shape — and the
 * screen would fail at runtime with "x is not a function".
 *
 * This is the check: unmock each module, read its real export list, and assert
 * the mock covers it. Extra keys on the mock are fine; missing ones are not.
 */

/** The modules renderedSetup.js replaces, and the path each is mocked at. */
const MOCKED_MODULES = [
  ['../../src/database/connection', () => jest.requireActual('../../src/database/connection')],
  ['../../src/database/db', () => jest.requireActual('../../src/database/db')],
  ['../../src/database/engagement', () => jest.requireActual('../../src/database/engagement')],
  ['../../src/database/heatmaps', () => jest.requireActual('../../src/database/heatmaps')],
  ['../../src/services/api', () => jest.requireActual('../../src/services/api')],
  ['../../src/services/aiSummary', () => jest.requireActual('../../src/services/aiSummary')],
];

/** Named exports only; default and the ESM marker are not part of the surface. */
function exportNames(moduleObject) {
  return Object.keys(moduleObject).filter((key) => key !== '__esModule' && key !== 'default');
}

describe('the shared mocks cover the real modules', () => {
  it.each(MOCKED_MODULES)('%s', (path, loadReal) => {
    const mocked = require(path);
    const real = loadReal();

    const missing = exportNames(real).filter((name) => !(name in mocked));
    expect(missing).toEqual([]);
  });

  it.each(MOCKED_MODULES)('%s exposes every function as a function', (path, loadReal) => {
    const mocked = require(path);
    const real = loadReal();

    const wrongType = exportNames(real).filter(
      (name) => typeof real[name] === 'function' && typeof mocked[name] !== 'function'
    );
    expect(wrongType).toEqual([]);
  });
});
