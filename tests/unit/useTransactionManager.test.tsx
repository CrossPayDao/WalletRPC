import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';

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

  it('syncNonce: 临时失败后应短退避重试并最终成功', async () => {
    vi.useFakeTimers();
    const getTransactionCount = vi
      .fn()
      .mockRejectedValueOnce(new Error('network-1'))
      .mockRejectedValueOnce(new Error('network-2'))
      .mockResolvedValueOnce(21);
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

    await act(async () => {
      const p = result.current.syncNonce();
      await vi.advanceTimersByTimeAsync(600);
      await p;
    });

    expect(getTransactionCount).toHaveBeenCalledTimes(3);
    expect(result.current.localNonceRef.current).toBe(21);
    vi.useRealTimers();
  });

  it('syncNonce 在 TRON 链或缺少 wallet/provider 时应直接跳过', async () => {
    const tronChain = { ...evmChain, chainType: 'TRON' as const, defaultRpcUrl: 'https://nile.trongrid.io' };
    const getTransactionCount = vi.fn(async () => 1);
    const provider = { getTransactionCount } as any;

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet: null,
          tronPrivateKey: null,
          provider: null,
          activeChain: tronChain,
          activeChainId: tronChain.id,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError: vi.fn(),
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );
    await act(async () => {
      await result.current.syncNonce();
    });
    expect(getTransactionCount).not.toHaveBeenCalled();
  });

  it('syncNonce: 重试全部失败时应保持 localNonceRef 为空', async () => {
    vi.useFakeTimers();
    const getTransactionCount = vi.fn().mockRejectedValue(new Error('rpc down'));
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

    await act(async () => {
      const p = result.current.syncNonce();
      await vi.advanceTimersByTimeAsync(800);
      await p;
    });

    expect(getTransactionCount).toHaveBeenCalledTimes(3);
    expect(result.current.localNonceRef.current).toBeNull();
    vi.useRealTimers();
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

  it('SAFE 模式发送原生币时 handleSafeProposal 返回 true 则整体成功', async () => {
    const setError = vi.fn();
    const provider = { getTransactionCount: vi.fn(async () => 0) } as any;
    const wallet = { address: '0x0000000000000000000000000000000000000001' } as any;
    const handleSafeProposal = vi.fn(async () => true);

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
          handleSafeProposal
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
    expect(out).toEqual({ success: true });
    expect(handleSafeProposal).toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('EVM EOA 成功发送后会记录交易并递增本地 nonce', async () => {
    const sendTransaction = vi.fn(async () => ({ hash: '0x' + '9'.repeat(64) }));
    const provider = {
      getTransactionCount: vi.fn(async () => 7)
    } as any;
    const wallet = {
      address: '0x0000000000000000000000000000000000000001',
      connect: vi.fn(() => ({ sendTransaction }))
    } as any;
    const setError = vi.fn();

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider,
          activeChain: evmChain,
          activeChainId: evmChain.id,
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
        recipient: '0x0000000000000000000000000000000000000002',
        amount: '1',
        asset: 'NATIVE'
      });
    });

    expect(out).toEqual({ success: true, hash: '0x' + '9'.repeat(64) });
    expect(provider.getTransactionCount).toHaveBeenCalledWith(wallet.address, 'pending');
    expect(sendTransaction).toHaveBeenCalled();
    expect(result.current.localNonceRef.current).toBe(8);
    expect(result.current.transactions[0].status).toBe('submitted');
  });

  it('EVM 发送发生 nonce 冲突时会重置 localNonceRef', async () => {
    const provider = {
      getTransactionCount: vi.fn(async () => 7)
    } as any;
    const wallet = {
      address: '0x0000000000000000000000000000000000000001',
      connect: vi.fn(() => ({
        sendTransaction: vi.fn(async () => {
          throw new Error('nonce too low');
        })
      }))
    } as any;
    const setError = vi.fn();

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider,
          activeChain: evmChain,
          activeChainId: evmChain.id,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError,
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    act(() => {
      result.current.localNonceRef.current = 12;
    });

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: '0x0000000000000000000000000000000000000002',
        amount: '1',
        asset: 'NATIVE'
      });
    });

    expect(out.success).toBe(false);
    expect(result.current.localNonceRef.current).toBeNull();
    expect(setError).toHaveBeenCalled();
  });

  it('TRON 发送成功时应追加 submitted 交易记录', async () => {
    const tronChain = { ...evmChain, chainType: 'TRON' as const, currencySymbol: 'TRX', defaultRpcUrl: 'https://nile.trongrid.io' };
    const wallet = { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any;
    const sendSpy = vi.spyOn(TronService, 'sendTransaction').mockResolvedValue({
      success: true,
      txid: 'a'.repeat(64)
    });

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: '0x' + '1'.repeat(64),
          provider: null,
          activeChain: tronChain,
          activeChainId: tronChain.id,
          activeAccountType: 'EOA',
          fetchData: vi.fn(),
          setError: vi.fn(),
          handleSafeProposal: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
        amount: '1',
        asset: 'NATIVE'
      });
    });

    expect(out).toEqual({ success: true, hash: 'a'.repeat(64) });
    expect(result.current.transactions[0].hash).toBe('a'.repeat(64));
    sendSpy.mockRestore();
  });

  it('TRON 广播失败时返回失败并设置错误', async () => {
    const tronChain = { ...evmChain, chainType: 'TRON' as const, currencySymbol: 'TRX', defaultRpcUrl: 'https://nile.trongrid.io' };
    const wallet = { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any;
    const setError = vi.fn();
    const sendSpy = vi.spyOn(TronService, 'sendTransaction').mockResolvedValue({
      success: false,
      error: 'RPC rejected'
    });

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: '0x' + '1'.repeat(64),
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
        recipient: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
        amount: '1',
        asset: 'NATIVE'
      });
    });

    expect(out.success).toBe(false);
    expect(setError).toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('SAFE 模式发送代币时应调用 handleSafeProposal 并编码 transfer data', async () => {
    const setError = vi.fn();
    const provider = { getTransactionCount: vi.fn(async () => 0) } as any;
    const tokenChain: ChainConfig = {
      ...evmChain,
      tokens: [
        {
          symbol: 'USDT',
          name: 'Tether USD',
          address: '0x00000000000000000000000000000000000000aa',
          decimals: 6
        }
      ]
    };
    const wallet = { address: '0x0000000000000000000000000000000000000001' } as any;
    const handleSafeProposal = vi.fn(async () => true);

    const { result } = renderHook(
      () =>
        useTransactionManager({
          wallet,
          tronPrivateKey: null,
          provider,
          activeChain: tokenChain,
          activeChainId: tokenChain.id,
          activeAccountType: 'SAFE',
          fetchData: vi.fn(),
          setError,
          handleSafeProposal
        }),
      { wrapper: LanguageProvider }
    );

    let out: any;
    await act(async () => {
      out = await result.current.handleSendSubmit({
        recipient: '0x0000000000000000000000000000000000000002',
        amount: '1.5',
        asset: 'USDT',
        assetAddress: tokenChain.tokens[0].address,
        assetDecimals: 6
      });
    });

    expect(out).toEqual({ success: true });
    expect(handleSafeProposal).toHaveBeenCalledTimes(1);
    const [target, value, data] = handleSafeProposal.mock.calls[0];
    expect(target).toBe(tokenChain.tokens[0].address);
    expect(value).toBe(0n);
    expect(String(data)).toMatch(/^0xa9059cbb/i);
  });
});
