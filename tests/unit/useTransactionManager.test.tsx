import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { LanguageProvider } from '../../contexts/LanguageContext';

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

describe('useTransactionManager', () => {
  it('clearTransactions 会清空交易记录并重置本地 nonce 镜像', () => {
    const { result } = renderHook(() =>
      useTransactionManager({
        wallet: null,
        tronPrivateKey: null,
        provider: null,
        activeChain: evmChain,
        activeChainId: 199,
        activeAccountType: 'EOA',
        fetchData: vi.fn(),
        setError: vi.fn(),
        handleSafeProposal: vi.fn()
      })
    , { wrapper: LanguageProvider });

    act(() => {
      result.current.localNonceRef.current = 12;
      result.current.addTransactionRecord({
        id: 'tx1',
        chainId: 199,
        hash: '0x' + 'a'.repeat(64),
        status: 'submitted',
        timestamp: Date.now(),
        summary: 'Send 1 BTT'
      });
    });
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.localNonceRef.current).toBe(12);

    act(() => {
      result.current.clearTransactions();
    });
    expect(result.current.transactions).toHaveLength(0);
    expect(result.current.localNonceRef.current).toBeNull();
  });

  it('仅在存在 pending 交易时才轮询收据', async () => {
    vi.useFakeTimers();
    const getTransactionReceipt = vi.fn();
    const provider = { getTransactionReceipt } as any;

    const { result } = renderHook(() =>
      useTransactionManager({
        wallet: null,
        tronPrivateKey: null,
        provider,
        activeChain: evmChain,
        activeChainId: 199,
        activeAccountType: 'EOA',
        fetchData: vi.fn(),
        setError: vi.fn(),
        handleSafeProposal: vi.fn()
      })
    , { wrapper: LanguageProvider });

    act(() => {
      result.current.addTransactionRecord({
        id: 'tx-confirmed',
        chainId: 199,
        hash: '0x' + '1'.repeat(64),
        status: 'confirmed',
        timestamp: Date.now(),
        summary: 'Confirmed'
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(20000);
      await Promise.resolve();
    });

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('pending 交易确认后合并触发一次刷新', async () => {
    vi.useFakeTimers();
    const getTransactionReceipt = vi.fn(async () => ({ status: 1 }));
    const provider = { getTransactionReceipt } as any;
    const fetchData = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useTransactionManager({
        wallet: null,
        tronPrivateKey: null,
        provider,
        activeChain: evmChain,
        activeChainId: 199,
        activeAccountType: 'EOA',
        fetchData,
        setError: vi.fn(),
        handleSafeProposal: vi.fn()
      })
    , { wrapper: LanguageProvider });

    act(() => {
      result.current.addTransactionRecord({
        id: 'tx-pending-1',
        chainId: 199,
        hash: '0x' + '2'.repeat(64),
        status: 'submitted',
        timestamp: Date.now(),
        summary: 'Pending 1'
      });
      result.current.addTransactionRecord({
        id: 'tx-pending-2',
        chainId: 199,
        hash: '0x' + '3'.repeat(64),
        status: 'submitted',
        timestamp: Date.now(),
        summary: 'Pending 2'
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getTransactionReceipt).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(fetchData).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });

  it('receipt 返回 status=0 时应标记失败并给出本地化错误提示', async () => {
    vi.useFakeTimers();
    const getTransactionReceipt = vi.fn(async () => ({ status: 0 }));
    const provider = { getTransactionReceipt } as any;

    const { result } = renderHook(() =>
      useTransactionManager({
        wallet: null,
        tronPrivateKey: null,
        provider,
        activeChain: evmChain,
        activeChainId: 199,
        activeAccountType: 'EOA',
        fetchData: vi.fn(),
        setError: vi.fn(),
        handleSafeProposal: vi.fn()
      })
    , { wrapper: LanguageProvider });

    act(() => {
      result.current.addTransactionRecord({
        id: 'tx-failed',
        chainId: 199,
        hash: '0x' + '5'.repeat(64),
        status: 'submitted',
        timestamp: Date.now(),
        summary: 'Pending failed'
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(result.current.transactions[0].status).toBe('failed');
    expect(result.current.transactions[0].error).toBeTruthy();
    vi.useRealTimers();
  });

  it('长时间未确认的 pending 交易会超时并停止轮询', async () => {
    vi.useFakeTimers();
    const getTransactionReceipt = vi.fn(async () => null);
    const provider = { getTransactionReceipt } as any;

    const { result } = renderHook(() =>
      useTransactionManager({
        wallet: null,
        tronPrivateKey: null,
        provider,
        activeChain: evmChain,
        activeChainId: 199,
        activeAccountType: 'EOA',
        fetchData: vi.fn(),
        setError: vi.fn(),
        handleSafeProposal: vi.fn()
      })
    , { wrapper: LanguageProvider });

    act(() => {
      result.current.addTransactionRecord({
        id: 'tx-timeout',
        chainId: 199,
        hash: '0x' + '4'.repeat(64),
        status: 'submitted',
        timestamp: Date.now() - 11 * 60 * 1000,
        summary: 'Pending timeout'
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(result.current.transactions[0].status).toBe('failed');
    expect(result.current.transactions[0].error).toContain('timeout');
    vi.useRealTimers();
  });

  it('syncNonce: localNonceRef 已有值时不应重复请求 eth_getTransactionCount', async () => {
    const getTransactionCount = vi.fn(async () => 99);
    const provider = { getTransactionCount } as any;
    const wallet = { address: '0x0000000000000000000000000000000000000001' } as any;

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider,
          activeChain: evmChain,
          activeChainId: 199,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError: vi.fn(),
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    act(() => {
      result.current.localNonceRef.current = 12;
    });

    await act(async () => {
      await result.current.syncNonce();
    });

    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(result.current.localNonceRef.current).toBe(12);
  });

  it('handleSendSubmit 在 EVM 缺少 wallet/provider 时返回失败并设置错误', async () => {
    const setError = vi.fn();
    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet: null,
          tronPrivateKey: null,
          provider: null,
          activeChain: evmChain,
          activeChainId: 199,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError,
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: '0x0000000000000000000000000000000000000001',
        amount: '1',
        asset: 'NATIVE'
      });
    });
    expect(out.success).toBe(false);
    expect(setError).toHaveBeenCalled();
  });

  it('handleSendSubmit 在 TRON 缺少私钥时返回失败并设置错误', async () => {
    const setError = vi.fn();
    const tronChain = { ...evmChain, chainType: 'TRON' as const, currencySymbol: 'TRX', defaultRpcUrl: 'https://nile.trongrid.io' };
    const wallet = { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any;

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider: null,
          activeChain: tronChain,
          activeChainId: tronChain.id,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError,
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
        amount: '1',
        asset: 'NATIVE'
      });
    });
    expect(out.success).toBe(false);
    expect(setError).toHaveBeenCalled();
  });

  it('SAFE 模式在缺少 handleSafeProposal 时返回失败', async () => {
    const setError = vi.fn();
    const provider = { getTransactionCount: vi.fn(async () => 0) } as any;
    const wallet = { address: '0x0000000000000000000000000000000000000001' } as any;

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider,
          activeChain: evmChain,
          activeChainId: evmChain.id,
          activeAccountType: 'SAFE',
          fetchData: vi.fn(),
          setError,
          handleSafeProposal: undefined
        }),
      { wrapper: LanguageProvider }
    );

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: '0x0000000000000000000000000000000000000002',
        amount: '1',
        asset: 'NATIVE'
      });
    });
    expect(out.success).toBe(false);
    expect(setError).toHaveBeenCalled();
  });
});
