import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';
import type { ChainConfig, TokenConfig } from '../../features/wallet/types';

const tronChain: ChainConfig = {
  id: 2494104990,
  name: 'Tron Nile Testnet',
  defaultRpcUrl: 'https://nile.trongrid.io',
  publicRpcUrls: ['https://nile.trongrid.io'],
  currencySymbol: 'TRX',
  chainType: 'TRON',
  explorers: [],
  tokens: []
};

const tronToken: TokenConfig = {
  symbol: 'USDT',
  name: 'Tether',
  address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  decimals: 6
};

const evmChain: ChainConfig = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: ['https://rpc.bittorrentchain.io'],
  currencySymbol: 'BTT',
  chainType: 'EVM',
  explorers: [],
  tokens: []
};

describe('useWalletData branches', () => {
  it('TRON token 查询失败时保留上一次已知余额，避免误置 0', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();

    const getBalanceSpy = vi.spyOn(TronService, 'getBalance');
    const getTokenSpy = vi.spyOn(TronService, 'getTRC20Balance');

    getBalanceSpy.mockResolvedValue(3_500_000n);
    getTokenSpy.mockResolvedValueOnce(1_234_567n).mockRejectedValueOnce(new Error('rpc down'));

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any,
          activeAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
          activeChain: tronChain,
          activeAccountType: 'EOA',
          activeChainTokens: [tronToken],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    const key = tronToken.address.toLowerCase();
    expect(result.current.tokenBalances[key]).toBe('1.234567');

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.tokenBalances[key]).toBe('1.234567');
    expect(setError).not.toHaveBeenCalled();
  });

  it('TRON 原生余额查询失败时进入 error phase 并给出同步错误', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();

    vi.spyOn(TronService, 'getBalance').mockRejectedValue(new Error('network failed'));
    vi.spyOn(TronService, 'getTRC20Balance').mockResolvedValue(0n);

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any,
          activeAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
          activeChain: tronChain,
          activeAccountType: 'EOA',
          activeChainTokens: [tronToken],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    await waitFor(() => {
      expect(result.current.sync.phase).toBe('error');
      expect(result.current.sync.error).toBeTruthy();
    });

    expect(setError).toHaveBeenCalled();
  });

  it('同一 scopeKey 下自动刷新只触发一次，地址变化后会再次自动刷新', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => 1_000_000_000_000_000_000n)
    } as any;

    const props = {
      wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
      activeAddress: '0x000000000000000000000000000000000000beef',
      activeChain: evmChain,
      activeAccountType: 'EOA' as const,
      activeChainTokens: [] as TokenConfig[],
      provider,
      setIsLoading,
      setError
    };

    const { rerender } = renderHook((p: typeof props) => useWalletData(p), {
      initialProps: props,
      wrapper: LanguageProvider
    });

    await waitFor(() => {
      expect(provider.getBalance).toHaveBeenCalledTimes(1);
    });

    rerender({ ...props });
    expect(provider.getBalance).toHaveBeenCalledTimes(1);

    rerender({
      ...props,
      activeAddress: '0x000000000000000000000000000000000000c0de'
    });
    await waitFor(() => {
      expect(provider.getBalance).toHaveBeenCalledTimes(2);
    });
  });

  it('fetchData 非强制模式在冷却时间内不会重复请求', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => 1_000_000_000_000_000n)
    } as any;

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000beef',
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [],
          provider,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await waitFor(() => {
      expect(provider.getBalance).toHaveBeenCalledTimes(1);
    });

    provider.getBalance.mockClear();
    await act(async () => {
      await result.current.fetchData(false);
      await result.current.fetchData(false);
    });

    expect(provider.getBalance).toHaveBeenCalledTimes(0);
  });

  it('EVM 且 provider 缺失时 fetchData 应直接返回', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000beef',
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });
    expect(setIsLoading).not.toHaveBeenCalledWith(true);
    expect(setError).not.toHaveBeenCalled();
  });

  it('TRON 缺失 host 时进入 error，并设置同步错误', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const tronNoHost: ChainConfig = { ...tronChain, defaultRpcUrl: '' };

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any,
          activeAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
          activeChain: tronNoHost,
          activeAccountType: 'EOA',
          activeChainTokens: [tronToken],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.sync.phase).toBe('error');
    expect(setError).toHaveBeenCalled();
  });

  it('有缓存时后续同步失败应保持 balanceKnown/tokenBalancesKnown 为 true', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => 1_000_000_000_000_000_000n)
    } as any;

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000beef',
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [],
          provider,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });
    expect(result.current.sync.phase).toBe('idle');

    provider.getBalance.mockRejectedValueOnce(new Error('rpc down'));
    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.sync.phase).toBe('error');
    expect(result.current.sync.balanceKnown).toBe(true);
    expect(result.current.sync.tokenBalancesKnown).toBe(true);
  });

  it('首次同步失败且无缓存时 known 标记应保持 false', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => {
        throw new Error('first-load-failed');
      })
    } as any;

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000beef',
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [],
          provider,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });
    expect(result.current.sync.phase).toBe('error');
    expect(result.current.sync.balanceKnown).toBe(false);
    expect(result.current.sync.tokenBalancesKnown).toBe(false);
    expect(setError).toHaveBeenCalled();
  });

  it('钱包登出时应清空缓存态并重置同步状态', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => 1_000_000_000_000_000_000n)
    } as any;

    const baseProps = {
      wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
      activeAddress: '0x000000000000000000000000000000000000beef',
      activeChain: evmChain,
      activeAccountType: 'EOA' as const,
      activeChainTokens: [] as TokenConfig[],
      provider,
      setIsLoading,
      setError
    };

    const { result, rerender } = renderHook((p: typeof baseProps) => useWalletData(p), {
      initialProps: baseProps,
      wrapper: LanguageProvider
    });

    await waitFor(() => {
      expect(result.current.sync.phase).toBe('idle');
      expect(result.current.sync.balanceKnown).toBe(true);
    });

    rerender({
      ...baseProps,
      wallet: null,
      activeAddress: null
    });

    await waitFor(() => {
      expect(result.current.balance).toBe('0.00');
      expect(result.current.tokenBalances).toEqual({});
      expect(result.current.safeDetails).toBeNull();
      expect(result.current.sync.phase).toBe('idle');
      expect(result.current.sync.balanceKnown).toBe(false);
      expect(result.current.sync.tokenBalancesKnown).toBe(false);
    });
  });
});
