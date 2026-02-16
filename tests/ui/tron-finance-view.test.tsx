import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TronFinanceView } from '../../features/wallet/components/TronFinanceView';
import type { ChainConfig } from '../../features/wallet/types';

const wrap = (ui: React.ReactElement) => render(ui);

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

const createManager = () => ({
  witnesses: [
    { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', name: 'Witness A', isActive: true },
    { address: 'TGzz8gjYiYRqpfmDwnLxfgPuLVNmpCswVp', name: 'Witness B', isActive: true }
  ],
  resources: {
    energyLimit: 1000,
    energyUsed: 100,
    freeNetLimit: 1000,
    freeNetUsed: 200,
    netLimit: 500,
    netUsed: 100,
    tronPowerLimit: 20,
    tronPowerUsed: 8
  },
  reward: { claimableSun: 0n, canClaim: false },
  votes: [
    { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', name: 'Witness A', votes: 8 },
    { address: 'TNotInCurrentWitnessListxxxxxxxxxxxx', name: 'Stale Witness', votes: 2 }
  ],
  action: { phase: 'idle' as const },
  failedSnapshot: null,
  isRefreshing: false,
  refreshFinanceData: vi.fn(),
  claimReward: vi.fn(async () => true),
  stakeResource: vi.fn(async () => true),
  unstakeResource: vi.fn(async () => true),
  withdrawUnfreeze: vi.fn(async () => true),
  voteWitnesses: vi.fn(async () => true),
  runOneClick: vi.fn(async () => true),
  oneClickProgress: {
    stage: 'failed' as const,
    active: false,
    skippedClaim: false,
    message: '失败：再投票未完成',
    steps: [
      { key: 'claim' as const, label: '领取奖励', status: 'success' as const, txid: '0xaaa', at: Date.now() - 2000 },
      { key: 'stake' as const, label: '追加质押', status: 'success' as const, txid: '0xbbb', at: Date.now() - 1000 },
      { key: 'vote' as const, label: '平均再投票', status: 'failed' as const, detail: 'Insufficient Tron Power', txid: '0xccc', at: Date.now() }
    ]
  },
  retryFailedStep: vi.fn(async () => true)
});

describe('TronFinanceView UI', () => {
  it('投票页默认勾选“历史已投票且在当前列表中”的对象', async () => {
    const manager = createManager();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '投票' }));

    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('闭环快捷展示三步状态并可见失败原因详情', async () => {
    const manager = createManager();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '闭环快捷' }));

    const step1 = await screen.findByText(/1\.\s*领取奖励/);
    const step2 = await screen.findByText(/2\.\s*追加质押/);
    const step3 = await screen.findByText(/3\.\s*平均再投票/);
    expect(step1).toBeInTheDocument();
    expect(step2).toBeInTheDocument();
    expect(step3).toBeInTheDocument();
    expect(await screen.findByText(/失败：再投票未完成/)).toBeInTheDocument();

    const voteStepDetails = step3.closest('details');
    expect(voteStepDetails).toBeTruthy();
    const voteSummary = within(voteStepDetails as HTMLElement).getByText(/3\.\s*平均再投票/);
    await user.click(voteSummary);
    expect(await within(voteStepDetails as HTMLElement).findByText(/txid:\s*0xccc/)).toBeInTheDocument();
    expect(await within(voteStepDetails as HTMLElement).findByText(/详情：Insufficient Tron Power/)).toBeInTheDocument();
  });

  it('资源页提交质押与解质押会调用 manager 方法', async () => {
    const manager = createManager();
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '1.5');
    await user.click(screen.getByRole('button', { name: '提交质押' }));
    expect(manager.stakeResource).toHaveBeenCalledWith(1500000n, 'ENERGY');

    await user.type(inputs[1], '2');
    await user.click(screen.getByRole('button', { name: '提交解质押' }));
    expect(manager.unstakeResource).toHaveBeenCalledWith(2000000n, 'ENERGY');

    await user.click(screen.getByRole('button', { name: '提取已解锁资产' }));
    expect(manager.withdrawUnfreeze).toHaveBeenCalled();
  });

  it('投票页会按总票数平均分配并提交', async () => {
    const manager = createManager();
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '投票' }));
    const voteInput = await screen.findByPlaceholderText('总票数（将平均分配）');
    await user.clear(voteInput);
    await user.type(voteInput, '5');

    // 默认仅选中 witnessA，再勾选 witnessB，最终应 3/2 平均
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole('button', { name: '提交投票' }));

    expect(manager.voteWitnesses).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ address: manager.witnesses[0].address, votes: 3 }),
        expect.objectContaining({ address: manager.witnesses[1].address, votes: 2 })
      ])
    );
  });

  it('奖励页在不可领取时禁用按钮，可领取时触发 claim', async () => {
    const manager = createManager();
    const user = userEvent.setup();
    const first = wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '奖励' }));
    const claimBtn = await screen.findByRole('button', { name: 'Claim Reward' });
    expect(claimBtn).toBeDisabled();
    first.unmount();

    const manager2 = createManager();
    manager2.reward = { claimableSun: 1000n, canClaim: true };
    const second = wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager2} />);
    await user.click(screen.getByRole('button', { name: '奖励' }));
    const claimBtn2 = await screen.findByRole('button', { name: 'Claim Reward' });
    expect(claimBtn2).not.toBeDisabled();
    await user.click(claimBtn2);
    expect(manager2.claimReward).toHaveBeenCalled();
    second.unmount();
  });

  it('当 witnesses 为空时展示提示，且投票按钮禁用', async () => {
    const manager = createManager();
    manager.witnesses = [];
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '投票' }));
    expect(await screen.findByText(/当前节点未返回可用 SR 列表/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交投票' })).toBeDisabled();
  });

  it('当可投票资源不足时展示风险提示并禁用提交', async () => {
    const manager = createManager();
    manager.resources = {
      ...manager.resources!,
      tronPowerLimit: 8,
      tronPowerUsed: 8
    };
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '投票' }));
    expect(await screen.findByText(/当前可投票资源不足/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交投票' })).toBeDisabled();
  });

  it('one-click 在无历史投票对象时禁用执行', async () => {
    const manager = createManager();
    manager.votes = [];
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '闭环快捷' }));
    expect(await screen.findByText(/当前无历史投票对象，无法自动再投票/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '执行闭环快捷' })).toBeDisabled();
  });

  it('存在 failedSnapshot 时展示 Resume 按钮并可触发重试', async () => {
    const manager = createManager();
    manager.failedSnapshot = { step: 'VOTE_WITNESS', payload: {} as any };
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    const btn = await screen.findByRole('button', { name: /Resume From Failed Step/ });
    await user.click(btn);
    expect(manager.retryFailedStep).toHaveBeenCalled();
  });

  it('action 状态为 signing/submitted/failed 时展示对应状态与 txid', () => {
    const managerSigning = createManager();
    managerSigning.action = { phase: 'signing', step: 'STAKE_RESOURCE' };
    const first = wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={managerSigning} />);
    expect(screen.getByText(/待签名 STAKE_RESOURCE/)).toBeInTheDocument();
    first.unmount();

    const managerSubmitted = createManager();
    managerSubmitted.action = { phase: 'submitted', step: 'VOTE_WITNESS', txid: '0xsub' };
    const second = wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={managerSubmitted} />);
    expect(screen.getByText(/已提交 VOTE_WITNESS/)).toBeInTheDocument();
    expect(screen.getByText(/txid:\s*0xsub/)).toBeInTheDocument();
    second.unmount();

    const managerFailed = createManager();
    managerFailed.action = { phase: 'failed', error: 'boom' };
    const third = wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={managerFailed} />);
    expect(screen.getByText(/失败:\s*boom/)).toBeInTheDocument();
    third.unmount();
  });

  it('one-click 默认步骤展示待执行，并在可执行时携带参数调用 runOneClick', async () => {
    const manager = createManager();
    manager.oneClickProgress = undefined;
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '闭环快捷' }));
    expect(await screen.findByText(/1\.\s*领取奖励/)).toBeInTheDocument();
    expect(screen.getAllByText('待执行').length).toBeGreaterThan(0);

    const stakeInput = screen.getByPlaceholderText('Stake TRX amount');
    await user.type(stakeInput, '1.25');
    await user.selectOptions(screen.getByRole('combobox'), 'BANDWIDTH');
    await user.click(screen.getByRole('button', { name: '执行闭环快捷' }));

    expect(manager.runOneClick).toHaveBeenCalledWith({
      resource: 'BANDWIDTH',
      stakeAmountSun: 1250000n,
      votes: []
    });
  });

  it('one-click 在 submitted 阶段禁用执行并展示处理中消息', async () => {
    const manager = createManager();
    manager.action = { phase: 'submitted', step: 'STAKE_RESOURCE' };
    manager.oneClickProgress = {
      stage: 'stake',
      active: true,
      skippedClaim: false,
      message: '质押已提交',
      steps: []
    };
    const user = userEvent.setup();
    wrap(<TronFinanceView activeChain={tronChain} onBack={vi.fn()} manager={manager} />);

    await user.click(screen.getByRole('button', { name: '闭环快捷' }));
    const busyBtn = screen.getByRole('button', { name: /处理中：质押已提交/ });
    expect(busyBtn).toBeDisabled();
  });
});
