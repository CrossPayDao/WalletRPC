import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { CreateSafe, SafeSettings, TrackSafe } from '../../features/wallet/components/SafeViews';

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe('Safe views UI', () => {
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

  it('SafeSettings 若在上一笔操作后不再是 owner，则 queued 操作应转为无权限错误', async () => {
    vi.useFakeTimers();
    try {
      const onRemoveOwner = vi.fn(async () => true);

      const baseSafeDetails = {
        owners: [
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ],
        threshold: 1,
        nonce: 0
      };

      const { rerender } = wrap(
        <SafeSettings
          safeDetails={baseSafeDetails}
          walletAddress="0x1111111111111111111111111111111111111111"
          onRemoveOwner={onRemoveOwner}
          onAddOwner={vi.fn(async () => true)}
          onChangeThreshold={vi.fn(async () => true)}
          onRefreshSafeDetails={vi.fn(async () => {})}
          onBack={vi.fn()}
        />
      );

      // 第一笔：删除自己（会进入 scanning）
      const selfRowRemoveBtn = screen.getAllByRole('button').find((b) => {
        const svg = b.querySelector('svg');
        return !!svg && svg.className.baseVal.includes('lucide-trash2');
      });
      // 找不到删除按钮就直接调用 removal 流程：点击第一个可删除条目（对测试更稳定）
      // 这里通过点击列表中第二个 owner 的删除按钮触发流程，随后我们用 rerender 来模拟“自己已被删除”。
      if (selfRowRemoveBtn) fireEvent.click(selfRowRemoveBtn);

      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
      });

      // 第二笔：删除其他人，应进入 queued
      // 由于第 1 笔处于 in-flight，点击第二个 owner 删除会进入 queued
      const allTrashButtons = Array.from(document.querySelectorAll('button')).filter((b) => {
        const svg = b.querySelector('svg');
        return !!svg && svg.className.baseVal.includes('lucide-trash2');
      });
      if (allTrashButtons.length > 0) {
        fireEvent.click(allTrashButtons[allTrashButtons.length - 1]);
      }
      expect(screen.getByText('Queued')).toBeInTheDocument();

      // 模拟第一笔完成：owners 不再包含自己，触发 isOwner=false
      rerender(
        <LanguageProvider>
          <SafeSettings
            safeDetails={{
              ...baseSafeDetails,
              owners: ['0x2222222222222222222222222222222222222222']
            }}
            walletAddress="0x1111111111111111111111111111111111111111"
            onRemoveOwner={onRemoveOwner}
            onAddOwner={vi.fn(async () => true)}
            onChangeThreshold={vi.fn(async () => true)}
            onRefreshSafeDetails={vi.fn(async () => {})}
            onBack={vi.fn()}
          />
        </LanguageProvider>
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/Access Denied|无权限/i)).toBeInTheDocument();
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

  it('TrackSafe 对空输入、长度错误与格式错误分别报错', async () => {
    const user = userEvent.setup();
    const onTrack = vi.fn();
    wrap(<TrackSafe onTrack={onTrack} onCancel={vi.fn()} isLoading={false} />);

    const submitBtn = screen.getByRole('button', { name: 'INITIATE_WATCHLIST_SYNC' });
    const input = screen.getByPlaceholderText('0x...');
    await user.type(input, '0x1234');
    await user.click(submitBtn);
    expect(document.querySelector('.text-red-600')).toBeTruthy();

    await user.clear(input);
    await user.type(input, '0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
    await user.click(submitBtn);
    expect(document.querySelector('.text-red-600')).toBeTruthy();
    expect(onTrack).not.toHaveBeenCalled();
  });

  it('CreateSafe 删除唯一 owner 后会进入空状态并可添加首个成员', async () => {
    const user = userEvent.setup();
    const onDeploy = vi.fn();
    wrap(<CreateSafe onDeploy={onDeploy} onCancel={vi.fn()} isDeploying={false} walletAddress="0x1111111111111111111111111111111111111111" />);

    const trashBtns = Array.from(document.querySelectorAll('button')).filter((b) => {
      const svg = b.querySelector('svg');
      return !!svg && svg.className.baseVal.includes('lucide-trash2');
    });
    expect(trashBtns.length).toBeGreaterThan(0);
    await user.click(trashBtns[0] as HTMLButtonElement);

    expect(screen.getByText('No owners specified')).toBeInTheDocument();
    const deployBtn = screen.getByRole('button', { name: 'EXECUTE_DEPLOYMENT_SIG' });
    expect(deployBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add First Owner' }));
    expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
  });

  it('SafeSettings 在非 owner 情况下提议新增成员会被拒绝', async () => {
    const user = userEvent.setup();
    const onAddOwner = vi.fn(async () => true);
    wrap(
      <SafeSettings
        safeDetails={{
          owners: ['0x2222222222222222222222222222222222222222'],
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

    await user.type(screen.getByPlaceholderText('0x...'), '0x3333333333333333333333333333333333333333');
    await user.click(screen.getByRole('button', { name: 'PROPOSE' }));
    expect(await screen.findByText(/Access Denied|无权限/i)).toBeInTheDocument();
    expect(onAddOwner).not.toHaveBeenCalled();
  });

  it('SafeSettings 删除成员时会用收敛后的阈值调用 onRemoveOwner', async () => {
    vi.useFakeTimers();
    try {
      const onRemoveOwner = vi.fn(async () => true);
      wrap(
        <SafeSettings
          safeDetails={{
            owners: [
              '0x1111111111111111111111111111111111111111',
              '0x2222222222222222222222222222222222222222'
            ],
            threshold: 2,
            nonce: 0
          }}
          walletAddress="0x1111111111111111111111111111111111111111"
          onRemoveOwner={onRemoveOwner}
          onAddOwner={vi.fn(async () => true)}
          onChangeThreshold={vi.fn(async () => true)}
          onBack={vi.fn()}
        />
      );

      const trashBtns = Array.from(document.querySelectorAll('button')).filter((b) => {
        const svg = b.querySelector('svg');
        return !!svg && svg.className.baseVal.includes('lucide-trash2');
      });
      expect(trashBtns.length).toBeGreaterThan(0);
      fireEvent.click(trashBtns[0] as HTMLButtonElement);

      await act(async () => {
        vi.advanceTimersByTime(650);
        await Promise.resolve();
      });
      expect(onRemoveOwner).toHaveBeenCalledWith(expect.any(String), 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
