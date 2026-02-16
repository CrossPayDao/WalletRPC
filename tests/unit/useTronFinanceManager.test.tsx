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

const buildHook = () => {
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
      refreshWalletData
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
});
