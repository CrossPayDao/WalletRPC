import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTronFinanceManager } from '../../features/wallet/hooks/useTronFinanceManager';
import type { ChainConfig } from '../../features/wallet/types';
import { TronService } from '../../services/tronService';

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

const witnessA = {
  address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
  name: 'Witness A',
  isActive: true
};

const witnessB = {
  address: 'TGzz8gjYiYRqpfmDwnLxfgPuLVNmpCswVp',
  name: 'Witness B',
  isActive: true
};

const setupTronServiceSpies = () => {
  vi.spyOn(TronService, 'normalizeHost').mockImplementation((v) => v);
  vi.spyOn(TronService, 'getWitnessWhitelist').mockReturnValue([witnessA, witnessB]);
  vi.spyOn(TronService, 'getNodeWitnesses').mockResolvedValue([witnessA, witnessB]);
  vi.spyOn(TronService, 'getAccountResources').mockResolvedValue({
    energyLimit: 1000,
    energyUsed: 100,
    freeNetLimit: 1500,
    freeNetUsed: 200,
    netLimit: 500,
    netUsed: 50,
    tronPowerLimit: 12,
    tronPowerUsed: 2
  });
  vi.spyOn(TronService, 'getRewardInfo').mockResolvedValue({
    claimableSun: 0n,
    canClaim: false
  });
  vi.spyOn(TronService, 'getVoteStatus').mockResolvedValue([
    { address: witnessA.address, votes: 8 }
  ]);
  vi.spyOn(TronService, 'claimReward').mockResolvedValue({ success: true, txid: 'tx-claim' });
  vi.spyOn(TronService, 'stakeResource').mockResolvedValue({ success: true, txid: 'tx-stake' });
  vi.spyOn(TronService, 'unstakeResource').mockResolvedValue({ success: true, txid: 'tx-unstake' });
  vi.spyOn(TronService, 'withdrawUnfreeze').mockResolvedValue({ success: true, txid: 'tx-withdraw' });
  vi.spyOn(TronService, 'voteWitnesses').mockResolvedValue({ success: true, txid: 'tx-vote' });
  vi.spyOn(TronService, 'getTransactionInfo').mockResolvedValue({ found: true, success: true });
};

const buildHook = (overrides?: Partial<Parameters<typeof useTronFinanceManager>[0]>) => {
  const setError = vi.fn();
  const setNotification = vi.fn();
  const addTransactionRecord = vi.fn();
  const refreshWalletData = vi.fn(async () => {});

  const hook = renderHook(() =>
    useTronFinanceManager({
      activeChain: tronChain,
      activeAddress: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
      tronPrivateKey: '0x' + '11'.repeat(32),
      enabled: true,
      setError,
      setNotification,
      addTransactionRecord,
      refreshWalletData,
      ...overrides
    })
  );

  return {
    ...hook,
    setError,
    setNotification,
    addTransactionRecord,
    refreshWalletData
  };
};

describe('useTronFinanceManager', () => {
  beforeEach(() => {
    setupTronServiceSpies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初始化会刷新资源/奖励/投票并把投票地址映射到 witness 名称', async () => {
    const { result } = buildHook();

    await waitFor(() => {
      expect(result.current.resources?.tronPowerLimit).toBe(12);
      expect(result.current.votes[0]?.name).toBe('Witness A');
    });
  });

  it('claimReward 成功后进入 confirmed，并写入交易记录与钱包刷新', async () => {
    const { result, addTransactionRecord, refreshWalletData } = buildHook();

    await waitFor(() => {
      expect(result.current.resources).not.toBeNull();
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.claimReward();
    });

    expect(ok).toBe(true);
    expect(result.current.action.phase).toBe('confirmed');
    expect(result.current.action.step).toBe('CLAIM_REWARD');
    expect(addTransactionRecord).toHaveBeenCalled();
    expect(refreshWalletData).toHaveBeenCalledWith(true);
  });

  it('voteWitnesses 会拦截不在当前 witness 列表内的地址', async () => {
    const { result, setError } = buildHook();

    await waitFor(() => {
      expect(result.current.witnesses.length).toBeGreaterThan(0);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.voteWitnesses([{ address: 'TNotInWitnessListxxxxxxxxxxxxxxxxxx', votes: 1 }]);
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Selected SR does not exist on current node. Please refresh witness list.');
  });

  it('runOneClick 在奖励为 0 时会跳过 claim 并完成质押+再投票', async () => {
    const { result, setNotification } = buildHook();

    await waitFor(() => {
      expect(result.current.votes.length).toBeGreaterThan(0);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.runOneClick({
        resource: 'ENERGY',
        stakeAmountSun: 1_000_000n,
        votes: []
      });
    });

    expect(ok).toBe(true);
    expect(result.current.oneClickProgress.stage).toBe('done');
    expect(result.current.oneClickProgress.steps[0]?.status).toBe('skipped');
    expect(result.current.oneClickProgress.steps[1]?.status).toBe('success');
    expect(result.current.oneClickProgress.steps[2]?.status).toBe('success');
    expect(setNotification).toHaveBeenCalledWith('TRON finance one-click flow completed');
  });

  it('runOneClick 质押数量为 0 时直接失败并返回可解释状态', async () => {
    const { result, setError } = buildHook();

    await waitFor(() => {
      expect(result.current.resources).not.toBeNull();
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.runOneClick({
        resource: 'ENERGY',
        stakeAmountSun: 0n,
        votes: []
      });
    });

    expect(ok).toBe(false);
    expect(result.current.oneClickProgress.stage).toBe('failed');
    expect(result.current.oneClickProgress.steps[1]?.status).toBe('failed');
    expect(setError).toHaveBeenCalledWith('Stake amount must be greater than 0');
  });

  it('缺少私钥时 claimReward 直接失败并提示', async () => {
    const { result, setError } = buildHook({ tronPrivateKey: null });

    let ok = true;
    await act(async () => {
      ok = await result.current.claimReward();
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('TRON private key missing');
  });

  it('stakeResource 数量 <=0 时会被参数校验拦截', async () => {
    const { result, setError } = buildHook();

    let ok = true;
    await act(async () => {
      ok = await result.current.stakeResource(0n, 'ENERGY');
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Stake amount must be greater than 0');
  });

  it('signing 中触发其他动作会被并发保护拦截', async () => {
    const deferred = (() => {
      let resolve: (value: { success: boolean; txid: string }) => void = () => {};
      const promise = new Promise<{ success: boolean; txid: string }>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    vi.mocked(TronService.claimReward).mockImplementation(() => deferred.promise);

    const { result, setError } = buildHook();

    let claimPromise: Promise<boolean> | null = null;
    act(() => {
      claimPromise = result.current.claimReward();
    });

    await waitFor(() => {
      expect(result.current.action.phase).toBe('signing');
    });

    let voteOk = true;
    await act(async () => {
      voteOk = await result.current.voteWitnesses([{ address: witnessA.address, votes: 1 }]);
    });

    expect(voteOk).toBe(false);
    expect(setError).toHaveBeenCalledWith('A TRON action is still processing. Please wait for confirmation.');

    deferred.resolve({ success: true, txid: 'tx-claim-pending' });
    let claimOk = false;
    await act(async () => {
      claimOk = await (claimPromise as Promise<boolean>);
    });
    expect(claimOk).toBe(true);
  });

  it('runOneClick 在无历史投票对象时失败并标记 vote 步骤', async () => {
    vi.mocked(TronService.getVoteStatus).mockResolvedValue([]);
    const { result, setError } = buildHook();

    await waitFor(() => {
      expect(result.current.witnesses.length).toBeGreaterThan(0);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.runOneClick({
        resource: 'ENERGY',
        stakeAmountSun: 1_000_000n,
        votes: []
      });
    });

    expect(ok).toBe(false);
    expect(result.current.oneClickProgress.stage).toBe('failed');
    expect(result.current.oneClickProgress.steps[2]?.status).toBe('failed');
    expect(setError).toHaveBeenCalledWith('No previous voted SR found. One-click re-vote requires historical voted witnesses.');
  });

  it('voteWitnesses 在无可用票权时会被拦截', async () => {
    vi.mocked(TronService.getAccountResources).mockResolvedValue({
      energyLimit: 1000,
      energyUsed: 100,
      freeNetLimit: 1500,
      freeNetUsed: 200,
      netLimit: 500,
      netUsed: 50,
      tronPowerLimit: 2,
      tronPowerUsed: 2
    });
    const { result, setError } = buildHook();

    await waitFor(() => {
      expect(result.current.resources?.tronPowerLimit).toBe(2);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.voteWitnesses([{ address: witnessA.address, votes: 1 }]);
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Insufficient Tron Power. Stake TRX first, then vote.');
  });

  it('voteWitnesses 票数全为无效值时会拦截', async () => {
    const { result, setError } = buildHook();
    await waitFor(() => {
      expect(result.current.witnesses.length).toBeGreaterThan(0);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.voteWitnesses([{ address: witnessA.address, votes: 0 }]);
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Vote count must be greater than 0');
  });

  it('claimReward 链上执行失败时进入 failed 状态', async () => {
    vi.mocked(TronService.getTransactionInfo).mockResolvedValue({ found: true, success: false });
    const { result, setError } = buildHook();

    await waitFor(() => {
      expect(result.current.resources).not.toBeNull();
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.claimReward();
    });

    expect(ok).toBe(false);
    expect(result.current.action.phase).toBe('failed');
    expect(result.current.action.step).toBe('CLAIM_REWARD');
    expect(setError).toHaveBeenCalledWith('Transaction execution failed on-chain');
  });

  it('stakeResource 失败后 retryFailedStep 会按快照重试', async () => {
    vi.mocked(TronService.stakeResource)
      .mockResolvedValueOnce({ success: false, error: 'stake fail' })
      .mockResolvedValueOnce({ success: true, txid: 'tx-stake-retry' });

    const { result } = buildHook();
    await waitFor(() => {
      expect(result.current.resources).not.toBeNull();
    });

    let first = true;
    await act(async () => {
      first = await result.current.stakeResource(1_000_000n, 'ENERGY');
    });
    expect(first).toBe(false);
    expect(result.current.failedSnapshot?.step).toBe('STAKE_RESOURCE');

    let retried = false;
    await act(async () => {
      retried = await result.current.retryFailedStep();
    });
    expect(retried).toBe(true);
    expect(TronService.stakeResource).toHaveBeenCalledTimes(2);
  });

  it('refreshFinanceData 并发触发时第二次调用应被锁跳过', async () => {
    const deferred = (() => {
      let resolve: (v: any) => void = () => {};
      const promise = new Promise((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    vi.mocked(TronService.getAccountResources).mockImplementation(() => deferred.promise as any);
    const { result } = buildHook();

    await act(async () => {
      const p1 = result.current.refreshFinanceData();
      const p2 = result.current.refreshFinanceData();
      deferred.resolve({
        energyLimit: 1000,
        energyUsed: 100,
        freeNetLimit: 1500,
        freeNetUsed: 200,
        netLimit: 500,
        netUsed: 50,
        tronPowerLimit: 12,
        tronPowerUsed: 2
      });
      await Promise.all([p1, p2]);
    });

    expect(TronService.getAccountResources).toHaveBeenCalledTimes(1);
  });

  it('disabled 时 refreshFinanceData 不应触发任何 RPC', async () => {
    const { result } = buildHook({ enabled: false });
    await act(async () => {
      await result.current.refreshFinanceData();
    });
    expect(TronService.getAccountResources).not.toHaveBeenCalled();
    expect(TronService.getRewardInfo).not.toHaveBeenCalled();
    expect(TronService.getVoteStatus).not.toHaveBeenCalled();
  });

  it('unstakeResource 数量 <=0 时会被参数校验拦截', async () => {
    const { result, setError } = buildHook();
    let ok = true;
    await act(async () => {
      ok = await result.current.unstakeResource(0n, 'ENERGY');
    });
    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Unstake amount must be greater than 0');
  });

  it('withdrawUnfreeze 在缺少私钥时会失败并提示', async () => {
    const { result, setError } = buildHook({ tronPrivateKey: null });
    let ok = true;
    await act(async () => {
      ok = await result.current.withdrawUnfreeze();
    });
    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('TRON private key missing');
  });

  it('submitted 同步骤动作应被阻塞，避免重复提交', async () => {
    const infoDeferred = (() => {
      let resolve: (v: { found: boolean; success: boolean }) => void = () => {};
      const promise = new Promise<{ found: boolean; success: boolean }>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    vi.mocked(TronService.claimReward).mockResolvedValue({ success: true, txid: 'tx-submitted-lock' });
    vi.mocked(TronService.getTransactionInfo)
      .mockImplementationOnce(() => infoDeferred.promise as any)
      .mockResolvedValue({ found: true, success: true });

    const { result, setError } = buildHook();
    let first: Promise<boolean> | null = null;
    act(() => {
      first = result.current.claimReward();
    });

    await waitFor(() => {
      expect(result.current.action.phase).toBe('submitted');
    });

    let second = true;
    await act(async () => {
      second = await result.current.claimReward();
    });
    expect(second).toBe(false);
    expect(setError).toHaveBeenCalledWith('Same TRON action is still awaiting confirmation. Please wait.');

    infoDeferred.resolve({ found: true, success: true });
    await act(async () => {
      await (first as Promise<boolean>);
    });
  });

  it('refreshFinanceData 部分接口失败时应给出刷新失败提示', async () => {
    vi.mocked(TronService.getRewardInfo).mockRejectedValue(new Error('reward-down'));
    const { result, setError } = buildHook();

    await act(async () => {
      await result.current.refreshFinanceData();
    });

    expect(setError).toHaveBeenCalledWith('TRON finance data refresh failed, please retry.');
  });

  it('runOneClick 在领奖失败时应停止并标记 claim 失败', async () => {
    vi.mocked(TronService.getRewardInfo).mockResolvedValue({
      claimableSun: 2_000_000n,
      canClaim: true
    });
    vi.mocked(TronService.claimReward).mockResolvedValue({ success: false, error: 'claim fail' });
    const { result } = buildHook();

    await waitFor(() => {
      expect(result.current.reward.canClaim).toBe(true);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.runOneClick({
        resource: 'ENERGY',
        stakeAmountSun: 1_000_000n,
        votes: []
      });
    });

    expect(ok).toBe(false);
    expect(result.current.oneClickProgress.stage).toBe('failed');
    expect(result.current.oneClickProgress.steps[0]?.status).toBe('failed');
  });

  it('retryFailedStep 在失败快照为空时应返回 false', async () => {
    const { result } = buildHook();
    let retried = true;
    await act(async () => {
      retried = await result.current.retryFailedStep();
    });
    expect(retried).toBe(false);
  });
});
