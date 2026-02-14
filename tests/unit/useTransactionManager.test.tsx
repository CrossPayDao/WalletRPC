import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';

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
    );

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
    );

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
    );

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
});
