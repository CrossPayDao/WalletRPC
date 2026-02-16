import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChainConfig, TokenConfig } from '../../features/wallet/types';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { LanguageProvider } from '../../contexts/LanguageContext';

const mocked = vi.hoisted(() => ({
  contractCtor: vi.fn()
}));

vi.mock('ethers', async () => {
  const actual = await vi.importActual<any>('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: mocked.contractCtor
    }
  };
});

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

describe('useWalletData safe meta refresh', () => {
  beforeEach(() => {
    mocked.contractCtor.mockReset();
  });

  it('refreshSafeDetails 非 force 失败时不应刷错误提示', async () => {
    const setError = vi.fn();
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;
    mocked.contractCtor.mockImplementation(function () {
      return {
        getOwners: vi.fn(async () => {
          throw new Error('rpc failed');
        }),
        getThreshold: vi.fn(async () => 2n),
        nonce: vi.fn(async () => 1n)
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading: vi.fn(),
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await Promise.resolve();
    });
    setError.mockClear();

    await act(async () => {
      await result.current.refreshSafeDetails(false);
    });

    expect(setError).not.toHaveBeenCalled();
  });

  it('refreshSafeDetails force=true 失败时应设置错误提示', async () => {
    const setError = vi.fn();
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;
    mocked.contractCtor.mockImplementation(function () {
      return {
        getOwners: vi.fn(async () => {
          throw new Error('rpc failed');
        }),
        getThreshold: vi.fn(async () => 2n),
        nonce: vi.fn(async () => 1n)
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading: vi.fn(),
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await Promise.resolve();
    });
    setError.mockClear();

    await act(async () => {
      await result.current.refreshSafeDetails(true);
    });

    expect(setError).toHaveBeenCalled();
  });

  it('非 SAFE 账户调用 refreshSafeDetails 会直接返回', async () => {
    const setError = vi.fn();
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;
    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading: vi.fn(),
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.refreshSafeDetails(true);
    });
    expect(provider.getCode).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('refreshSafeDetails 非 force 模式在冷却期内不会重复请求', async () => {
    const setError = vi.fn();
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;
    mocked.contractCtor.mockImplementation(function () {
      return {
        getOwners: vi.fn(async () => ['0x' + '2'.repeat(40)]),
        getThreshold: vi.fn(async () => 2n),
        nonce: vi.fn(async () => 1n)
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading: vi.fn(),
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.refreshSafeDetails(false);
    });
    const calledAfterFirst = provider.getCode.mock.calls.length;

    await act(async () => {
      await result.current.refreshSafeDetails(false);
    });

    expect(provider.getCode.mock.calls.length).toBe(calledAfterFirst);
    expect(setError).not.toHaveBeenCalled();
  });

  it('refreshSafeDetails 可按 fields 仅更新部分 safe 元数据', async () => {
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;

    const getOwners = vi.fn(async () => ['0x' + '2'.repeat(40)]);
    const getThreshold = vi.fn(async () => 2n);
    const getNonce = vi.fn(async () => 7n);
    mocked.contractCtor.mockImplementation(function () {
      return {
        getOwners,
        getThreshold,
        nonce: getNonce
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading: vi.fn(),
          setError: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.refreshSafeDetails(true);
    });
    await waitFor(() => {
      expect(result.current.safeDetails).not.toBeNull();
    });
    getOwners.mockClear();
    getThreshold.mockClear();
    getNonce.mockClear();

    await act(async () => {
      await result.current.refreshSafeDetails(true, { owners: false, threshold: true, nonce: false });
    });

    expect(getThreshold).toHaveBeenCalledTimes(1);
    expect(getOwners).not.toHaveBeenCalled();
    expect(getNonce).not.toHaveBeenCalled();
  });

});
