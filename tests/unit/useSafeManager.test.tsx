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

  it('handleSafeProposal 在当前钱包不是 owner 时抛错', async () => {
    const params = baseParams();
    const safeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => ['0x0000000000000000000000000000000000000001']),
      getThreshold: vi.fn(async () => 1n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32))
    };
    mocked.contractCtor.mockImplementation(() => safeContract as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await expect(
      result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x')
    ).rejects.toThrow();
  });

  it('deploySafe 在 tx.wait 失败时会回填错误', async () => {
    const params = baseParams();
    const createProxyWithNonce = Object.assign(
      vi.fn(async () => ({ hash: '0xdeploy', wait: vi.fn(async () => { throw new Error('wait failed'); }) })),
      { staticCall: vi.fn(async () => '0x000000000000000000000000000000000000c0de') }
    );
    mocked.interfaceCtor.mockImplementation(() => ({ encodeFunctionData: vi.fn(() => '0xsetup') }) as any);
    mocked.contractCtor.mockImplementation(() => ({ createProxyWithNonce }) as any);
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.deploySafe([params.wallet!.address], 1);
    });

    await waitFor(() => {
      expect(params.setError).toHaveBeenCalled();
    });
  });

  it('deploySafe 在工厂调用失败时会直接报错', async () => {
    const params = baseParams();
    const createProxyWithNonce = Object.assign(
      vi.fn(async () => { throw new Error('factory failed'); }),
      { staticCall: vi.fn(async () => '0x000000000000000000000000000000000000c0de') }
    );
    mocked.interfaceCtor.mockImplementation(() => ({ encodeFunctionData: vi.fn(() => '0xsetup') }) as any);
    mocked.contractCtor.mockImplementation(() => ({ createProxyWithNonce }) as any);
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.deploySafe([params.wallet!.address], 1);
    });
    expect(params.setError).toHaveBeenCalled();
  });

  it('removeOwnerTx 在目标 owner 不存在时抛错', async () => {
    const params = baseParams();
    mocked.contractCtor.mockImplementation(() => ({
      getOwners: vi.fn(async () => [params.wallet!.address]),
      interface: { encodeFunctionData: vi.fn(() => '0xremove') }
    }) as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await expect(result.current.removeOwnerTx('0x0000000000000000000000000000000000000001', 1)).rejects.toThrow();
  });

  it('changeThresholdTx 与 removeOwnerTx 会编码函数并走提议路径', async () => {
    const params = baseParams();
    const encodeSpy = vi.fn(() => '0xencoded');
    const proposalSafeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => [params.wallet!.address]),
      getThreshold: vi.fn(async () => 2n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32)),
      interface: { encodeFunctionData: encodeSpy }
    };
    mocked.contractCtor
      .mockImplementationOnce(() => ({
        getOwners: vi.fn(async () => [params.wallet!.address, '0x0000000000000000000000000000000000000002']),
        interface: { encodeFunctionData: encodeSpy }
      }) as any)
      .mockImplementationOnce(() => proposalSafeContract as any)
      .mockImplementationOnce(() => ({ interface: { encodeFunctionData: encodeSpy } }) as any)
      .mockImplementationOnce(() => proposalSafeContract as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await expect(result.current.removeOwnerTx(params.wallet!.address, 1)).rejects.toThrow();
    await expect(result.current.changeThresholdTx(2)).rejects.toThrow();
  });

  it('并发提交 proposal 时第二次调用应返回 busy 错误', async () => {
    const params = baseParams();
    const deferred = (() => {
      let resolve: (v: number) => void = () => {};
      const promise = new Promise<number>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    const safeContract = {
      nonce: vi.fn(() => deferred.promise),
      getOwners: vi.fn(async () => [params.wallet!.address]),
      getThreshold: vi.fn(async () => 2n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32))
    };
    mocked.contractCtor.mockImplementation(() => safeContract as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    const p1 = result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x');
    await expect(
      result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x')
    ).rejects.toThrow();

    deferred.resolve(1);
    await expect(p1).rejects.toThrow();
  });

  it('deploySafe 在缺少 wallet/provider 时直接返回', async () => {
    const params = baseParams();
    params.wallet = null;

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.deploySafe(['0x0000000000000000000000000000000000000001'], 1);
    });

    expect(params.addTransactionRecord).not.toHaveBeenCalled();
    expect(params.setError).not.toHaveBeenCalled();
  });

  it('deploySafe 未预测到地址时不应切换 active safe', async () => {
    const params = baseParams();
    const createProxyWithNonce = Object.assign(
      vi.fn(async () => ({ hash: '0xdeploy', wait: vi.fn(async () => ({})) })),
      { staticCall: vi.fn(async () => null) }
    );
    mocked.interfaceCtor.mockImplementation(() => ({ encodeFunctionData: vi.fn(() => '0xsetup') }) as any);
    mocked.contractCtor.mockImplementation(() => ({ createProxyWithNonce }) as any);
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.deploySafe([params.wallet!.address], 1);
    });

    expect(params.setActiveSafeAddress).not.toHaveBeenCalled();
    expect(params.setActiveAccountType).not.toHaveBeenCalledWith('SAFE');
  });

  it('addOwnerTx/removeOwnerTx/changeThresholdTx 在 threshold=1 时可走成功提议路径', async () => {
    const params = baseParams();
    const encodeSpy = vi.fn(() => '0xencoded');
    const safeWrite = {
      execTransaction: vi.fn(async () => ({ hash: '0x' + 'a'.repeat(64) }))
    };
    const proposalSafeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => [params.wallet!.address, '0x0000000000000000000000000000000000000002']),
      getThreshold: vi.fn(async () => 1n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32)),
      connect: vi.fn().mockReturnValue(safeWrite),
      interface: { encodeFunctionData: encodeSpy }
    };

    mocked.contractCtor
      .mockImplementationOnce(function () {
        return { interface: { encodeFunctionData: encodeSpy } } as any;
      })
      .mockImplementationOnce(function () {
        return proposalSafeContract as any;
      })
      .mockImplementationOnce(function () {
        return {
        getOwners: vi.fn(async () => [params.wallet!.address, '0x0000000000000000000000000000000000000002']),
        interface: { encodeFunctionData: encodeSpy }
      } as any;
      })
      .mockImplementationOnce(function () {
        return proposalSafeContract as any;
      })
      .mockImplementationOnce(function () {
        return { interface: { encodeFunctionData: encodeSpy } } as any;
      })
      .mockImplementationOnce(function () {
        return proposalSafeContract as any;
      });

    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });

    await expect(result.current.addOwnerTx('0x0000000000000000000000000000000000000003', 1)).resolves.toBe(true);
    await expect(result.current.removeOwnerTx(params.wallet!.address, 1)).resolves.toBe(true);
    await expect(result.current.changeThresholdTx(1)).resolves.toBe(true);
    expect(safeWrite.execTransaction).toHaveBeenCalledTimes(3);
  });

  it('handleSafeProposal 当签名 v>=30 时不应再次调整 v', async () => {
    mocked.signatureFrom.mockReturnValue({
      r: '0x' + '33'.repeat(32),
      s: '0x' + '44'.repeat(32),
      v: 31
    } as any);
    const params = baseParams();
    const execTransaction = vi.fn(async () => ({ hash: '0xhash-v31' }));
    const safeContract = {
      nonce: vi.fn(async () => 1n),
      getOwners: vi.fn(async () => [params.wallet!.address]),
      getThreshold: vi.fn(async () => 1n),
      getTransactionHash: vi.fn(async () => '0x' + 'ab'.repeat(32)),
      connect: vi.fn().mockReturnValue({ execTransaction })
    };
    mocked.contractCtor.mockImplementation(function () {
      return safeContract as any;
    });
    vi.spyOn(FeeService, 'getOptimizedFeeData').mockResolvedValue({} as any);
    vi.spyOn(FeeService, 'buildOverrides').mockReturnValue({} as any);

    const { result } = renderHook(() => useSafeManager(params), { wrapper: LanguageProvider });
    await expect(
      result.current.handleSafeProposal('0x0000000000000000000000000000000000000001', 0n, '0x', 'sig-v31')
    ).resolves.toBe(true);
    expect(execTransaction).toHaveBeenCalled();
  });

});
