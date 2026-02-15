import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('SafeSettings 在扫描过久时应进入超时阶段（避免永久扫描）', async () => {
    vi.useFakeTimers();
    try {
      const onAddOwner = vi.fn(async () => true);
      const onRefreshSafeDetails = vi.fn(async () => {});

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
          onRefreshSafeDetails={onRefreshSafeDetails}
          onBack={vi.fn()}
        />
      );

      fireEvent.change(screen.getByPlaceholderText('0x...'), {
        target: { value: '0x2222222222222222222222222222222222222222' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'PROPOSE' }));

      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
      });
      expect(screen.getByText('Scanning...')).toBeInTheDocument();
      expect(onRefreshSafeDetails).toHaveBeenCalled();

      // flush effect that schedules the verify-timeout timer
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(180000);
        await Promise.resolve();
      });
      expect(screen.getByText('Scan timeout')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('SafeSettings 在阈值为 1 时会将连续成员变更请求排队并按顺序执行', async () => {
    vi.useFakeTimers();
    try {
      const onAddOwner = vi.fn(async () => true);

      const baseSafeDetails = {
        owners: ['0x1111111111111111111111111111111111111111'],
        threshold: 1,
        nonce: 0
      };

      const ui = (
        <SafeSettings
          safeDetails={baseSafeDetails}
          walletAddress="0x1111111111111111111111111111111111111111"
          onRemoveOwner={vi.fn(async () => true)}
          onAddOwner={onAddOwner}
          onChangeThreshold={vi.fn(async () => true)}
          onRefreshSafeDetails={vi.fn(async () => {})}
          onBack={vi.fn()}
        />
      );

      const { rerender } = wrap(ui);

      // 第一次提议：进入 scanning，并触发一次广播回调
      fireEvent.change(screen.getByPlaceholderText('0x...'), {
        target: { value: '0x2222222222222222222222222222222222222222' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'PROPOSE' }));

      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
      });
      expect(onAddOwner).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Scanning...')).toBeInTheDocument();

      // 第二次提议：应进入 queued，而不会立即触发广播
      fireEvent.change(screen.getByPlaceholderText('0x...'), {
        target: { value: '0x3333333333333333333333333333333333333333' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'PROPOSE' }));
      expect(onAddOwner).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Queued')).toBeInTheDocument();

      // 模拟第一次上链成功：owners 已包含第一个新增地址，队列应开始执行第二个请求
      rerender(
        <LanguageProvider>
          <SafeSettings
            safeDetails={{
              ...baseSafeDetails,
              owners: [
                ...baseSafeDetails.owners,
                '0x2222222222222222222222222222222222222222'
              ]
            }}
            walletAddress="0x1111111111111111111111111111111111111111"
            onRemoveOwner={vi.fn(async () => true)}
            onAddOwner={onAddOwner}
            onChangeThreshold={vi.fn(async () => true)}
            onRefreshSafeDetails={vi.fn(async () => {})}
            onBack={vi.fn()}
          />
        </LanguageProvider>
      );

      // flush effects, then run queued item building->syncing delay
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
      });
      expect(onAddOwner).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
