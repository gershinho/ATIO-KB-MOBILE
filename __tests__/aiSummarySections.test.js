import { parseAiSummarySections } from '../src/utils/aiSummarySections';

describe('parseAiSummarySections — nothing usable', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '   \n  '],
    ['a number', 42],
    ['an object', { summary: 'x' }],
  ])('returns nothing for %s', (_label, input) => {
    expect(parseAiSummarySections(input)).toEqual([]);
  });
});

describe('parseAiSummarySections — no recognisable headers', () => {
  it('keeps the whole response as a single Summary section', () => {
    expect(parseAiSummarySections('These two are broadly similar.')).toEqual([
      { title: 'Summary', content: 'These two are broadly similar.' },
    ]);
  });

  it('trims the surrounding whitespace off it', () => {
    expect(parseAiSummarySections('  padded  ')[0].content).toBe('padded');
  });
});

describe('parseAiSummarySections — headers', () => {
  it('splits the three sections the prompt asks for', () => {
    const parsed = parseAiSummarySections(
      'USE CASES: Both target smallholders.\nAPPROACH: A is sensor-led, B is advisory.\nCOMPLEXITY + COST: A costs more.'
    );
    expect(parsed.map((s) => s.title)).toEqual(['Use Case', 'Approach', 'Complexity/Cost']);
    expect(parsed[1].content).toBe('A is sensor-led, B is advisory.');
  });

  it('accepts the singular spelling', () => {
    expect(parseAiSummarySections('USE CASE: shared')[0].title).toBe('Use Case');
  });

  it('accepts a slash instead of a plus', () => {
    expect(parseAiSummarySections('COMPLEXITY / COST: similar')[0].title).toBe('Complexity/Cost');
  });

  it('accepts numbered headers', () => {
    const parsed = parseAiSummarySections('1) USE CASES: a\n2) APPROACH: b');
    expect(parsed.map((s) => s.title)).toEqual(['Use Case', 'Approach']);
  });

  it('is case insensitive', () => {
    expect(parseAiSummarySections('Use Cases: shared ground')[0].title).toBe('Use Case');
  });

  it('drops a header that was given no content', () => {
    const parsed = parseAiSummarySections('USE CASES:\nAPPROACH: only this one has text');
    expect(parsed).toEqual([{ title: 'Approach', content: 'only this one has text' }]);
  });

  it('ignores a preamble before the first header', () => {
    const parsed = parseAiSummarySections('Here is the comparison.\nAPPROACH: differs');
    expect(parsed).toEqual([{ title: 'Approach', content: 'differs' }]);
  });

  it('keeps multi-line content with a section', () => {
    const parsed = parseAiSummarySections('APPROACH: first line\nstill the approach');
    expect(parsed[0].content).toBe('first line\nstill the approach');
  });
});
