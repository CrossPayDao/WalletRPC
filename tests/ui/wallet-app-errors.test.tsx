import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { WalletApp } from '../../features/wallet/WalletApp';
import { LanguageProvider } from '../../contexts/LanguageContext';

vi.mock('../../features/wallet/hooks/useEvmWallet', () => ({
  useEvmWallet: vi.fn()
}));

const getUseEvmWalletMock = async () => {
  const mod = await import('../../features/wallet/hooks/useEvmWallet');
  return vi.mocked(mod.useEvmWallet);
};

describe('WalletApp error auto-dismiss (dedupe-aware)', () => {
  it('应按 errorObject.expiresAt 自动清除错误', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:00:00.000Z'));

    const setError = vi.fn();
    const useEvmWallet = await getUseEvmWalletMock();

    useEvmWallet.mockReturnValue({
      wallet: null,
      view: 'onboarding',
      privateKeyOrPhrase: '',
      setPrivateKeyOrPhrase: vi.fn(),
      handleImport: vi.fn(async () => false),
      error: 'ERR',
      errorObject: {
        message: 'ERR',
        shownAt: Date.now(),
        lastEventAt: Date.now(),
        expiresAt: Date.now() + 5000,
        count: 1
      },
      notification: null,
      setError
    } as any);

    render(
      <LanguageProvider>
        <WalletApp />
      </LanguageProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(setError).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(setError).toHaveBeenCalledWith(null);

    vi.useRealTimers();
  });

  it('当 expiresAt 被延长时，应取消旧定时器并按新的时间点清除', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:00:00.000Z'));

    const setError = vi.fn();
    const useEvmWallet = await getUseEvmWalletMock();

    const base = {
      wallet: null,
      view: 'onboarding',
      privateKeyOrPhrase: '',
      setPrivateKeyOrPhrase: vi.fn(),
      handleImport: vi.fn(async () => false),
      error: 'ERR',
      notification: null,
      setError
    } as any;

    // 初始：5s 过期
    useEvmWallet.mockReturnValue({
      ...base,
      errorObject: {
        message: 'ERR',
        shownAt: Date.now(),
        lastEventAt: Date.now(),
        expiresAt: Date.now() + 5000,
        count: 1
      }
    });

    const { rerender } = render(
      <LanguageProvider>
        <WalletApp />
      </LanguageProvider>
    );

    // 1s 后：延长到 10s
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    useEvmWallet.mockReturnValue({
      ...base,
      errorObject: {
        message: 'ERR',
        shownAt: Date.now() - 1000,
        lastEventAt: Date.now(),
        expiresAt: Date.now() + 9000, // 总计 shownAt+10s
        count: 2
      }
    });
    rerender(
      <LanguageProvider>
        <WalletApp />
      </LanguageProvider>
    );

    // 到 5s 时不应清除（旧 timer 必须被取消）
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(setError).not.toHaveBeenCalled();

    // 到 10s 时应清除
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(setError).toHaveBeenCalledWith(null);

    vi.useRealTimers();
  });
});

