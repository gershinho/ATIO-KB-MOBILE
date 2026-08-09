import { formatRelativeDate } from '../src/utils/relativeDate';

const NOW = new Date('2026-08-08T12:00:00Z').getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('formatRelativeDate', () => {
  it('returns an empty string for falsy timestamps', () => {
    expect(formatRelativeDate(0)).toBe('');
    expect(formatRelativeDate(null)).toBe('');
    expect(formatRelativeDate(undefined)).toBe('');
  });

  it('says "Just now" for anything under a minute', () => {
    expect(formatRelativeDate(NOW)).toBe('Just now');
    expect(formatRelativeDate(NOW - 59_000)).toBe('Just now');
  });

  it('switches to minutes at exactly one minute', () => {
    expect(formatRelativeDate(NOW - MIN)).toBe('1m ago');
  });

  it('reports minutes up to 59', () => {
    expect(formatRelativeDate(NOW - 5 * MIN)).toBe('5m ago');
    expect(formatRelativeDate(NOW - 59 * MIN)).toBe('59m ago');
  });

  it('switches to hours at exactly one hour', () => {
    expect(formatRelativeDate(NOW - HOUR)).toBe('1h ago');
  });

  it('reports hours up to 23', () => {
    expect(formatRelativeDate(NOW - 23 * HOUR)).toBe('23h ago');
  });

  it('switches to days at exactly 24 hours', () => {
    expect(formatRelativeDate(NOW - DAY)).toBe('1d ago');
  });

  it('reports days up to 6', () => {
    expect(formatRelativeDate(NOW - 6 * DAY)).toBe('6d ago');
  });

  it('falls back to a locale date at 7 days and beyond', () => {
    const sevenDaysAgo = NOW - 7 * DAY;
    expect(formatRelativeDate(sevenDaysAgo)).toBe(
      new Date(sevenDaysAgo).toLocaleDateString()
    );
    expect(formatRelativeDate(sevenDaysAgo)).not.toMatch(/ago|Just now/);
  });

  it('does not crash on a future timestamp', () => {
    // Negative diff floors to a negative minute count, so it is not "Just now".
    expect(() => formatRelativeDate(NOW + HOUR)).not.toThrow();
    expect(typeof formatRelativeDate(NOW + HOUR)).toBe('string');
  });
});
