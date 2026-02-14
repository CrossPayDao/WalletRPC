import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { CreateSafe, SafeQueue, SafeSettings, TrackSafe } from '../../features/wallet/components/SafeViews';
import { SafePendingTx } from '../../features/wallet/types';

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe('Safe views UI', () => {
  it('SafeQueue 在达不到阈值时禁止执行并可触发签名', async () => {
    const user = userEvent.setup();
    const onSign = vi.fn();
    const onExecute = vi.fn();
    const safeAddress = '0x00000000000000000000000000000000000000aa';
    const tx: SafePendingTx = {
      id: '1',
      chainId: 199,
      safeAddress,
      to: '0x00000000000000000000000000000000000000aa',
      value: '0',
      data: '0x',
      nonce: 2,
      safeTxHash: '0x' + 'a'.repeat(64),
      signatures: { '0x1111111111111111111111111111111111111111': '0x1234' },
      summary: 'Send 1 ETH'
    };

    wrap(
      <SafeQueue
        pendingTxs={[tx]}
        safeDetails={{ owners: ['0x1111111111111111111111111111111111111111'], threshold: 2, nonce: 2 }}
        activeChainId={199}
        activeSafeAddress={safeAddress}
        walletAddress="0x2222222222222222222222222222222222222222"
        onSign={onSign}
        onExecute={onExecute}
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Sign' }));
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled();
  });

  it('SafeQueue 只展示当前链和当前 Safe 的待执行交易', () => {
    const safeAddress = '0x00000000000000000000000000000000000000aa';
    const txs: SafePendingTx[] = [
      {
        id: 'match',
        chainId: 199,
        safeAddress,
        to: '0x00000000000000000000000000000000000000bb',
        value: '0',
        data: '0x',
        nonce: 5,
        safeTxHash: '0x' + '1'.repeat(64),
        signatures: {},
        summary: 'Match Tx'
      },
      {
        id: 'other-chain',
        chainId: 1,
        safeAddress,
        to: '0x00000000000000000000000000000000000000cc',
        value: '0',
        data: '0x',
        nonce: 5,
        safeTxHash: '0x' + '2'.repeat(64),
        signatures: {},
        summary: 'Other Chain'
      },
      {
        id: 'other-safe',
        chainId: 199,
        safeAddress: '0x00000000000000000000000000000000000000dd',
        to: '0x00000000000000000000000000000000000000dd',
        value: '0',
        data: '0x',
        nonce: 5,
        safeTxHash: '0x' + '3'.repeat(64),
        signatures: {},
        summary: 'Other Safe'
      }
    ];

    wrap(
      <SafeQueue
        pendingTxs={txs}
        safeDetails={{ owners: [], threshold: 1, nonce: 5 }}
        activeChainId={199}
        activeSafeAddress={safeAddress}
        walletAddress="0x1111111111111111111111111111111111111111"
        onSign={vi.fn()}
        onExecute={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('Match Tx')).toBeInTheDocument();
    expect(screen.queryByText('Other Chain')).toBeNull();
    expect(screen.queryByText('Other Safe')).toBeNull();
  });

  it('SafeSettings 可更新阈值', async () => {
    const user = userEvent.setup();
    const onChangeThreshold = vi.fn(async () => true);
    wrap(
      <SafeSettings
        safeDetails={{
          owners: [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222'
          ],
          threshold: 1,
          nonce: 0
        }}
        walletAddress="0x1111111111111111111111111111111111111111"
        onRemoveOwner={vi.fn(async () => true)}
        onAddOwner={vi.fn(async () => true)}
        onChangeThreshold={onChangeThreshold}
        onBack={vi.fn()}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, '2');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(onChangeThreshold).toHaveBeenCalledWith(2);
  });

  it('SafeSettings 在提议返回 false 时展示错误状态', async () => {
    const user = userEvent.setup();
    const onAddOwner = vi.fn(async () => false);

    wrap(
      <SafeSettings
        safeDetails={{
          owners: ['0x1111111111111111111111111111111111111111'],
          threshold: 1,
          nonce: 0
        }}
        walletAddress="0x1111111111111111111111111111111111111111"
        onRemoveOwner={vi.fn(async () => true)}
        onAddOwner={onAddOwner}
        onChangeThreshold={vi.fn(async () => true)}
        onBack={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x2222222222222222222222222222222222222222');
    await user.click(screen.getByRole('button', { name: 'PROPOSE' }));

    expect(await screen.findByText('Proposal failed', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(onAddOwner).toHaveBeenCalledTimes(1);
  });

  it('CreateSafe 会过滤空 owner 并提交', async () => {
    const user = userEvent.setup();
    const onDeploy = vi.fn();
    wrap(<CreateSafe onDeploy={onDeploy} onCancel={vi.fn()} isDeploying={false} walletAddress="0x1111111111111111111111111111111111111111" />);

    await user.click(screen.getByText('Append Member'));
    const inputs = screen.getAllByPlaceholderText('0x...');
    await user.type(inputs[1], '0x2222222222222222222222222222222222222222');
    await user.click(screen.getByRole('button', { name: 'EXECUTE_DEPLOYMENT_SIG' }));

    expect(onDeploy).toHaveBeenCalledWith(
      ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
      1
    );
  });

  it('TrackSafe 对非法地址报错，对合法地址回调', async () => {
    const user = userEvent.setup();
    const onTrack = vi.fn();
    wrap(<TrackSafe onTrack={onTrack} onCancel={vi.fn()} isLoading={false} />);

    const input = screen.getByPlaceholderText('0x...');
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'INITIATE_WATCHLIST_SYNC' }));
    expect(screen.getByText('Invalid prefix')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '0x000000000000000000000000000000000000dEaD');
    await user.click(screen.getByRole('button', { name: 'INITIATE_WATCHLIST_SYNC' }));
    expect(onTrack).toHaveBeenCalledWith('0x000000000000000000000000000000000000dEaD');
  });
});
