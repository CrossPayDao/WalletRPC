import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FeeService } from '../../services/feeService';
import { useSafeManager } from '../../features/wallet/hooks/useSafeManager';
import { LanguageProvider } from '../../contexts/LanguageContext';
import type { ChainConfig } from '../../features/wallet/types';

const mocked = vi.hoisted(() => ({
  contractCtor: vi.fn(),
  interfaceCtor: vi.fn(),
  signatureFrom: vi.fn(() => ({
    r: '0x' + '11'.repeat(32),
    s: '0x' + '22'.repeat(32),
    v: 27
  }))
}));

vi.mock('ethers', async () => {
  const actual = await vi.importActual<any>('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: mocked.contractCtor,
      Interface: mocked.interfaceCtor,
      Signature: {
        ...actual.ethers.Signature,
        from: mocked.signatureFrom
      }
    }
  };
});

const chain: ChainConfig = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: ['https://rpc.bittorrentchain.io'],
  currencySymbol: 'BTT',
  chainType: 'EVM',
  explorers: [],
  tokens: []
};

const baseParams = () => ({
  wallet: {
    address: '0x000000000000000000000000000000000000beef',
    signMessage: vi.fn(async () => '0x' + '11'.repeat(65)),
    connect: vi.fn().mockReturnThis()
  } as any,
  activeSafeAddress: '0x000000000000000000000000000000000000dEaD',
  activeChainId: 199,
  activeChain: chain,
  provider: {
    getCode: vi.fn(async () => '0x1234')
  } as any,
  setTrackedSafes: vi.fn(),
  setActiveAccountType: vi.fn(),
  setActiveSafeAddress: vi.fn(),
  setView: vi.fn(),
  setNotification: vi.fn(),
  setError: vi.fn(),
  addTransactionRecord: vi.fn()
});

describe('useSafeManager', () => {
  beforeEach(() => {
    mocked.contractCtor.mockReset();
    mocked.interfaceCtor.mockReset();
    mocked.signatureFrom.mockClear();
  });

  it('缺少 wallet/provider/safe 时会阻止提议', async () => {
    const params = baseParams();
    params.wallet = null;
    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    await expect(result.current.handleSafeProposal('0x1', 0n, '0x')).rejects.toThrow();
  });

  it('threshold=1 时执行 flash execution 并记录交易', async () => {
    const params = baseParams();
    const safeWrite = {
      execTransaction: vi.fn(async () => ({ hash: '0xhash' }))
    };
    const safeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => [params.wallet!.address]),
      getThreshold: vi.fn(async () => 1n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32)),
      connect: vi.fn().mockReturnValue(safeWrite)
    };

    mocked.contractCtor.mockImplementation(function () {
      return safeContract;
    });
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    let ok = false;
    await act(async () => {
      ok = await result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x', 'summary');
    });

    expect(ok).toBe(true);
    expect(safeWrite.execTransaction).toHaveBeenCalled();
    expect(params.addTransactionRecord).toHaveBeenCalled();
  });

  it('threshold>=2 时返回队列不可用错误', async () => {
    const params = baseParams();
    const safeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => [params.wallet!.address]),
      getThreshold: vi.fn(async () => 2n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32))
    };

    mocked.contractCtor.mockImplementation(function () {
      return safeContract;
    });

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    await expect(
      result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x')
    ).rejects.toThrow();
  });

  it('deploySafe 在广播后会设置 active safe', async () => {
    const params = baseParams();
    const createProxyWithNonce = Object.assign(
      vi.fn(async () => ({ hash: '0xdeploy', wait: vi.fn(async () => ({})) })),
      {
        staticCall: vi.fn(async () => '0x000000000000000000000000000000000000c0de')
      }
    );

    mocked.interfaceCtor.mockImplementation(function () {
      return {
        encodeFunctionData: vi.fn(() => '0xsetup')
      };
    });

    mocked.contractCtor.mockImplementation(function () {
      return { createProxyWithNonce };
    });
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    await act(async () => {
      await result.current.deploySafe([params.wallet!.address], 1);
    });

    await waitFor(() => {
      expect(params.setActiveSafeAddress).toHaveBeenCalledWith('0x000000000000000000000000000000000000c0de');
      expect(params.setActiveAccountType).toHaveBeenCalledWith('SAFE');
      expect(params.setView).toHaveBeenCalledWith('dashboard');
    });
  });
});
