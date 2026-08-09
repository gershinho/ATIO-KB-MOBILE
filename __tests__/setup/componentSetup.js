/**
 * Shared setup for component tests.
 *
 * The app's data layer reaches expo-sqlite, expo-file-system and expo-asset at
 * module scope, and its network layer reaches the backend. Component tests care
 * about rendering and interaction, so those boundaries are mocked here once
 * rather than in every file.
 */
// RNTL 13 ships its jest matchers (toBeOnTheScreen etc.) built in — no
// extend-expect import needed.

// --- Data layer -----------------------------------------------------------
jest.mock('../../src/database/db', () => ({
  initDatabase: jest.fn().mockResolvedValue({}),
  getStats: jest.fn().mockResolvedValue({ innovations: 0, countries: 0, sdgs: 17 }),
  getTopRegions: jest.fn().mockResolvedValue([]),
  getChallengeCounts: jest.fn().mockResolvedValue({}),
  getTypeCounts: jest.fn().mockResolvedValue({}),
  searchInnovations: jest.fn().mockResolvedValue([]),
  countInnovations: jest.fn().mockResolvedValue(0),
  getRecentInnovations: jest.fn().mockResolvedValue([]),
  getHelpInnovations: jest.fn().mockResolvedValue([]),
  getAllCountries: jest.fn().mockResolvedValue([]),
  getDataSources: jest.fn().mockResolvedValue([]),
}));

// The data layer is four modules: connection (opening + schema), db (the
// read-only catalogue), engagement (the only part that writes), and heatmaps
// (derived grids).
jest.mock('../../src/database/engagement', () => ({
  getCachedBullets: jest.fn().mockResolvedValue(null),
  setCachedBullets: jest.fn().mockResolvedValue(undefined),
  getCommentsForInnovation: jest.fn().mockResolvedValue([]),
  addCommentToInnovation: jest.fn().mockResolvedValue(true),
  incrementThumbsUp: jest.fn().mockResolvedValue(true),
  decrementThumbsUp: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/database/heatmaps', () => ({
  getOpportunityHeatmapData: jest.fn().mockResolvedValue({ rows: [], cols: [], cells: {} }),
  getReadyToUseHeatmapData: jest.fn().mockResolvedValue({
    rows: [], cols: [], cells: {}, minReadiness: 0, maxReadiness: 9,
  }),
  resetHeatmapCaches: jest.fn(),
}));

// --- Network layer --------------------------------------------------------
jest.mock('../../src/services/api', () => ({
  apiOrigin: jest.fn(() => 'http://test.local:3001'),
  IS_DEV_API_HOST: true,
  backendHeaders: jest.fn((extra = {}) => ({ ...extra })),
  aiSearch: jest.fn().mockResolvedValue({ results: [], hasMore: false, total: 0 }),
  transcribeAudio: jest.fn().mockResolvedValue({ text: '' }),
  summarizeBullets: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/aiSummary', () => ({
  generateComparisonSummary: jest.fn().mockResolvedValue({ summary: 'test summary' }),
}));

// --- Native modules -------------------------------------------------------
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    stop: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    uri: null,
  }),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

// expo-file-system's current API is class-based: File/Directory instances with
// synchronous exists/create/write, and a static File.downloadFileAsync.
jest.mock('expo-file-system', () => {
  class MockFile {
    constructor(...segments) {
      this.uri = segments
        .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
        .join('/');
      this.exists = true;
    }
    create = jest.fn();
    write = jest.fn();
    copy = jest.fn();
    delete = jest.fn();
    static downloadFileAsync = jest.fn().mockResolvedValue('file:///test/out');
  }
  class MockDirectory extends MockFile {}
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///test' }, cache: { uri: 'file:///test/cache' } },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Silence the intentional console.error/warn calls added for diagnosability so
// they do not drown the test output. Assertions can still spy on them.
const realError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[')) return;
    realError(...args);
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
