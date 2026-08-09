import { createLogger } from '../src/utils/logger';

describe('createLogger', () => {
  let error, warn, log;

  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('tags every line with its module, which most sites used to omit', () => {
    const logger = createLogger('storage');
    logger.failed('boom');
    logger.degraded('meh');
    logger.note('fyi');

    expect(error).toHaveBeenCalledWith('[storage]', 'boom');
    expect(warn).toHaveBeenCalledWith('[storage]', 'meh');
    expect(log).toHaveBeenCalledWith('[storage]', 'fyi');
  });

  it('maps each severity to its console channel', () => {
    const logger = createLogger('x');
    logger.failed('a');
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('passes the error along so the stack survives', () => {
    const cause = new Error('underlying');
    createLogger('db').failed('Could not open:', cause);
    expect(error).toHaveBeenCalledWith('[db]', 'Could not open:', cause);
  });

  it('accepts several details', () => {
    createLogger('db').note('context', 1, { a: 2 });
    expect(log).toHaveBeenCalledWith('[db]', 'context', 1, { a: 2 });
  });

  it('keeps loggers independent', () => {
    createLogger('one').note('a');
    createLogger('two').note('b');
    expect(log).toHaveBeenNthCalledWith(1, '[one]', 'a');
    expect(log).toHaveBeenNthCalledWith(2, '[two]', 'b');
  });
});
