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

  it('refreshSafeDetails 当地址不是合约时应直接返回且不实例化 Safe 合约', async () => {
    const provider = {
      getCode: vi.fn(async () => '0x'),
      getBalance: vi.fn(async () => 0n)
    } as any;
    mocked.contractCtor.mockImplementation(() => {
      throw new Error('should not be called');
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

    provider.getCode.mockClear();
    await act(async () => {
      await result.current.refreshSafeDetails(true);
    });
    expect(provider.getCode).toHaveBeenCalledTimes(1);
    expect(mocked.contractCtor).not.toHaveBeenCalled();
    expect(result.current.safeDetails).toBeNull();
  });

  it('refreshSafeDetails in-flight 时第二次调用应被跳过', async () => {
    let resolveCode: (v: string) => void = () => {};
    const provider = {
      getCode: vi.fn(() => new Promise<string>((r) => { resolveCode = r; })),
      getBalance: vi.fn(async () => 0n)
    } as any;

    mocked.contractCtor.mockImplementation(() => ({
      getOwners: vi.fn(async () => ['0x' + '2'.repeat(40)]),
      getThreshold: vi.fn(async () => 2n),
      nonce: vi.fn(async () => 1n)
    }));

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

    provider.getCode.mockClear();
    let p1: Promise<void> | null = null;
    let p2: Promise<void> | null = null;
    await act(async () => {
      p1 = result.current.refreshSafeDetails(true);
      p2 = result.current.refreshSafeDetails(true);
      resolveCode('0x1234');
      await Promise.all([p1, p2]);
    });

    expect(provider.getCode).toHaveBeenCalledTimes(1);
  });

  it('refreshSafeDetails 在缺少 wallet/activeAddress/provider 或 TRON 链时直接返回', async () => {
    const base = {
      activeChain: evmChain,
      activeAccountType: 'SAFE' as const,
      activeChainTokens: [] as TokenConfig[],
      setIsLoading: vi.fn(),
      setError: vi.fn()
    };

    const case1 = renderHook(
      () =>
        useWalletData({
          ...base,
          wallet: null,
          activeAddress: '0x' + '1'.repeat(40),
          provider: { getCode: vi.fn(), getBalance: vi.fn() } as any
        }),
      { wrapper: LanguageProvider }
    );
    await act(async () => {
      await case1.result.current.refreshSafeDetails(true);
    });

    const provider2 = { getCode: vi.fn(), getBalance: vi.fn() } as any;
    const case2 = renderHook(
      () =>
        useWalletData({
          ...base,
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: null,
          provider: provider2
        }),
      { wrapper: LanguageProvider }
    );
    await act(async () => {
      await case2.result.current.refreshSafeDetails(true);
    });
    expect(provider2.getCode).not.toHaveBeenCalled();

    const provider3 = { getCode: vi.fn(), getBalance: vi.fn() } as any;
    const case3 = renderHook(
      () =>
        useWalletData({
          ...base,
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: { ...evmChain, chainType: 'TRON' },
          provider: provider3
        } as any),
      { wrapper: LanguageProvider }
    );
    await act(async () => {
      await case3.result.current.refreshSafeDetails(true);
    });
    expect(provider3.getCode).not.toHaveBeenCalled();

    const case4 = renderHook(
      () =>
        useWalletData({
          ...base,
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          provider: null
        }),
      { wrapper: LanguageProvider }
    );
    await act(async () => {
      await case4.result.current.refreshSafeDetails(true);
    });
  });

  it('refreshSafeDetails 局部更新可仅刷新 owners 与 nonce', async () => {
    const provider = {
      getCode: vi.fn(async () => '0x1234'),
      getBalance: vi.fn(async () => 0n)
    } as any;

    const getOwners = vi.fn(async () => ['0x' + '3'.repeat(40)]);
    const getThreshold = vi.fn(async () => 2n);
    const getNonce = vi.fn(async () => 9n);
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
    getOwners.mockClear();
    getThreshold.mockClear();
    getNonce.mockClear();

    await act(async () => {
      await result.current.refreshSafeDetails(true, { owners: true, threshold: false, nonce: true });
    });

    expect(getOwners).toHaveBeenCalledTimes(1);
    expect(getNonce).toHaveBeenCalledTimes(1);
    expect(getThreshold).not.toHaveBeenCalled();
  });

});
