/**
 * The web heat maps, and the grids kept between sessions.
 *
 * The card lists "the heatmap results" alongside the taxonomies as things
 * IndexedDB should hold. What makes that safe rather than another thing to
 * invalidate is the key: a grid is a pure function of the catalogue pass's
 * rows, so it is stored against that pass's `builtAt` and is current exactly as
 * long as the rows are.
 */
import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';

const mockLoadCatalogIndex = jest.fn();
const mockResetCatalogIndex = jest.fn();
const mockBuildOpportunityGrid = jest.fn();
const mockBuildReadyToUseGrid = jest.fn();

jest.mock('../src/api/jsonapi/catalogIndex', () => ({
  loadCatalogIndex: mockLoadCatalogIndex,
  resetCatalogIndex: mockResetCatalogIndex,
}));
jest.mock('../src/database/heatmapGrids', () => ({
  buildOpportunityGrid: mockBuildOpportunityGrid,
  buildReadyToUseGrid: mockBuildReadyToUseGrid,
}));

const {
  getOpportunityHeatmapData,
  getReadyToUseHeatmapData,
  resetHeatmapCaches,
} = require('../src/database/heatmaps.web');
const { resetIdbConnection } = require('../src/storage/idb');

const rows = [{ id: 'a', readiness: 5, readinessExact: 5 }];
const grid = (tag) => ({ rows: ['r'], cols: ['c'], cells: { r: { c: { count: 1, tag } } } });

beforeEach(async () => {
  jest.clearAllMocks();
  getOpportunityHeatmapData.reset();
  getReadyToUseHeatmapData.reset();
  resetIdbConnection();
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase('atio-kb');
    r.onsuccess = resolve; r.onerror = resolve; r.onblocked = resolve;
  });
  mockLoadCatalogIndex.mockResolvedValue({ rows, builtAt: 1000 });
  mockBuildOpportunityGrid.mockReturnValue(grid('opportunity'));
  mockBuildReadyToUseGrid.mockReturnValue(grid('readyToUse'));
});

describe('the web heat maps', () => {
  it('builds a grid the first time and stores it', async () => {
    const first = await getOpportunityHeatmapData();

    expect(mockBuildOpportunityGrid).toHaveBeenCalledTimes(1);
    expect(first.cells.r.c.tag).toBe('opportunity');
  });

  it('serves a later session from storage without rebuilding', async () => {
    await getOpportunityHeatmapData();
    // A new session: the in-memory memo is gone, the store is not.
    getOpportunityHeatmapData.reset();
    mockBuildOpportunityGrid.mockClear();

    const again = await getOpportunityHeatmapData();

    expect(mockBuildOpportunityGrid).not.toHaveBeenCalled();
    expect(again.cells.r.c.tag).toBe('opportunity');
  });

  it('rebuilds when the catalogue pass has moved on', async () => {
    await getOpportunityHeatmapData();
    getOpportunityHeatmapData.reset();
    mockBuildOpportunityGrid.mockClear();

    // The pass refreshed: same shape, different builtAt.
    mockLoadCatalogIndex.mockResolvedValue({ rows, builtAt: 2000 });
    await getOpportunityHeatmapData();

    expect(mockBuildOpportunityGrid).toHaveBeenCalledTimes(1);
  });

  it('keeps the two grids apart, under one builtAt', async () => {
    const opportunity = await getOpportunityHeatmapData();
    const readyToUse = await getReadyToUseHeatmapData();

    expect(opportunity.cells.r.c.tag).toBe('opportunity');
    expect(readyToUse.cells.r.c.tag).toBe('readyToUse');

    // Storing the second must not have evicted the first.
    getOpportunityHeatmapData.reset();
    mockBuildOpportunityGrid.mockClear();
    await getOpportunityHeatmapData();
    expect(mockBuildOpportunityGrid).not.toHaveBeenCalled();
  });

  it('reads the exact readiness for the ready-to-use grid', async () => {
    await getReadyToUseHeatmapData();

    const passed = mockBuildReadyToUseGrid.mock.calls[0][0];
    expect(passed[0].readiness).toBe(rows[0].readinessExact);
  });

  it('answers only once when both callers arrive together', async () => {
    const [a, b] = await Promise.all([getOpportunityHeatmapData(), getOpportunityHeatmapData()]);

    expect(mockBuildOpportunityGrid).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('clears the stored grid too when everything is reset', async () => {
    await getOpportunityHeatmapData();
    resetHeatmapCaches();
    // The delete is fire-and-forget, so let it land before looking.
    await new Promise((resolve) => setTimeout(resolve, 50));
    mockBuildOpportunityGrid.mockClear();

    await getOpportunityHeatmapData();
    expect(mockBuildOpportunityGrid).toHaveBeenCalledTimes(1);
  });

  it('does not keep a rejection, so one failure does not poison the session', async () => {
    mockLoadCatalogIndex.mockRejectedValueOnce(new Error('portal down'));
    await expect(getOpportunityHeatmapData()).rejects.toThrow('portal down');

    mockLoadCatalogIndex.mockResolvedValue({ rows, builtAt: 1000 });
    await expect(getOpportunityHeatmapData()).resolves.toBeTruthy();
  });
});
