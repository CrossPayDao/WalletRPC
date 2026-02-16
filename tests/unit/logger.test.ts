import { afterEach, describe, expect, it, vi } from 'vitest';
import { __LOGGER_TEST__, devError, devWarn } from '../../services/logger';

describe('logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    __LOGGER_TEST__.resetEnvGetter();
  });

  it('DEV=false 时不输出', () => {
    __LOGGER_TEST__.setEnvGetter(() => ({ DEV: false, MODE: 'development' }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    devWarn('warn');
    devError('error');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('DEV=true 但 MODE=test 时静默', () => {
    __LOGGER_TEST__.setEnvGetter(() => ({ DEV: true, MODE: 'test' }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    devWarn('warn');
    devError('error');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('DEV=true 且非 test 时输出', () => {
    __LOGGER_TEST__.setEnvGetter(() => ({ DEV: true, MODE: 'development' }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    devWarn('warn', { a: 1 });
    devError('error', { b: 2 });

    expect(warnSpy).toHaveBeenCalledWith('warn', { a: 1 });
    expect(errSpy).toHaveBeenCalledWith('error', { b: 2 });
  });
});
