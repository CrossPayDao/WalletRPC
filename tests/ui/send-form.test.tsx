import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendForm, SendFormData } from '../../features/wallet/components/SendForm';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { ChainConfig, TransactionRecord } from '../../features/wallet/types';

const renderWithProvider = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
const syncOk = {
  phase: 'idle' as const,
  rpcUrl: 'https://rpc.local',
  balanceKnown: true,
  tokenBalancesKnown: true,
  lastUpdatedAt: Date.now(),
  error: null as string | null
};

const chain: ChainConfig = {
  id: 1,
  name: 'Ethereum',
  defaultRpcUrl: 'https://rpc.local',
  publicRpcUrls: ['https://rpc.local'],
  currencySymbol: 'ETH',
  chainType: 'EVM',
  explorers: [
    {
      name: 'Etherscan',
      key: 'etherscan',
      url: 'https://etherscan.io',
      txPath: 'https://etherscan.io/tx/{txid}',
      addressPath: 'https://etherscan.io/address/{address}'
    }
  ],
  tokens: [
    { symbol: 'USDT', name: 'Tether', address: '0x00000000000000000000000000000000000000aa', decimals: 6 }
  ]
};

const txs: TransactionRecord[] = [];
const tronChain: ChainConfig = {
  ...chain,
  id: 2494104990,
  name: 'TRON',
  currencySymbol: 'TRX',
  chainType: 'TRON',
  explorers: [
    {
      name: 'Tronscan',
      key: 'tronscan',
      url: 'https://tronscan.org',
      txPath: 'https://tronscan.org/#/transaction/{txid}',
      addressPath: 'https://tronscan.org/#/address/{address}'
    }
  ]
};

describe('SendForm UI', () => {
  it('挂载时不会自动触发刷新', () => {
    const onRefresh = vi.fn();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{ NATIVE: '1.00', [chain.tokens[0].address.toLowerCase()]: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={onRefresh}
        isLoading={false}
        transactions={txs}
      />
    );

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('金额为空时禁用发送按钮', () => {
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{ NATIVE: '1.00', [chain.tokens[0].address.toLowerCase()]: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    const btn = screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' });
    expect(btn).toBeDisabled();
  });

  it('选择 token 后会把 assetAddress 传给 onSend', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn<(data: SendFormData) => Promise<{ success: boolean; error: string }>>(async () => ({ success: false, error: 'mock error' }));

    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{ NATIVE: '1.00', [chain.tokens[0].address.toLowerCase()]: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={onSend}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dead');
    await user.type(screen.getByPlaceholderText('0.0'), '1');
    await user.selectOptions(screen.getByRole('combobox'), chain.tokens[0].address.toLowerCase());

    await user.click(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' }));

    expect(onSend).toHaveBeenCalledTimes(1);
    const payload = onSend.mock.calls[0]![0];
    expect(payload.asset).toBe('USDT');
    expect(payload.assetAddress.toLowerCase()).toBe(chain.tokens[0].address.toLowerCase());
    expect(payload.assetDecimals).toBe(6);
  });

  it('高精度大数余额比较应正确识别不足额', async () => {
    const user = userEvent.setup();

    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{
          NATIVE: '1.00',
          [chain.tokens[0].address.toLowerCase()]: '9007199254740992.000000'
        }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    await user.selectOptions(screen.getByRole('combobox'), chain.tokens[0].address.toLowerCase());
    await user.type(screen.getByPlaceholderText('0.0'), '9007199254740992.000001');

    expect(screen.getByRole('button', { name: 'Liquidity Shortfall' })).toBeVisible();
  });

  it('TRON 地址格式错误时应禁用发送', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <SendForm
        activeChain={tronChain}
        tokens={[]}
        balances={{ NATIVE: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('T...'), '0xdeadbeef');
    await user.type(screen.getByPlaceholderText('0.0'), '1');
    expect(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' })).toBeDisabled();
  });

  it('余额未知时按钮禁用，且显示同步中状态', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{ NATIVE: '1.00', [chain.tokens[0].address.toLowerCase()]: '10.00' }}
        dataSync={{ ...syncOk, tokenBalancesKnown: false, phase: 'updating' }}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.selectOptions(screen.getByRole('combobox'), chain.tokens[0].address.toLowerCase());
    expect(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' })).toBeDisabled();
    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });

  it('不足额时第一次点击仅确认，第二次点击才调用 onSend', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => ({ success: false, error: 'mock error' }));

    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '1.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={onSend}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    await user.type(screen.getByPlaceholderText('0.0'), '2');
    const btn = screen.getByRole('button', { name: 'Liquidity Shortfall' });

    await user.click(btn);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'PROCEED_ANYWAY_SIG' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'PROCEED_ANYWAY_SIG' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('超时状态下若交易列表变为 confirmed，应自动切换为 success', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => ({ success: true, isTimeout: true, hash: '0xtimeout' }));
    const txTimeout: TransactionRecord[] = [];

    const { rerender } = renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={onSend}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txTimeout}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    await user.type(screen.getByPlaceholderText('0.0'), '1');
    await user.click(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' }));
    expect(await screen.findByText('Pending Validation')).toBeInTheDocument();

    const confirmed: TransactionRecord[] = [{
      id: '1',
      chainId: 1,
      hash: '0xtimeout',
      status: 'confirmed',
      timestamp: Date.now(),
      summary: 'ok'
    }];
    rerender(
      <LanguageProvider>
        <SendForm
          activeChain={chain}
          tokens={[]}
          balances={{ NATIVE: '10.00' }}
          dataSync={syncOk}
          activeAccountType="EOA"
          onSend={onSend}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          isLoading={false}
          transactions={confirmed}
        />
      </LanguageProvider>
    );

    expect(await screen.findByText('Transmission Confirmed')).toBeInTheDocument();
  });

  it('EVM 地址前缀、长度与格式错误时应展示校验信息并禁用发送', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '1.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    const recipient = screen.getByPlaceholderText('0x...');
    const amount = screen.getByPlaceholderText('0.0');
    const sendBtn = screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' });

    await user.type(amount, '1');
    await user.type(recipient, 'abc');
    expect(sendBtn).toBeDisabled();

    await user.clear(recipient);
    await user.type(recipient, '0x1234');
    expect(sendBtn).toBeDisabled();

    await user.clear(recipient);
    await user.type(recipient, '0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
    expect(sendBtn).toBeDisabled();
  });

  it('金额格式非法或为 0 时应提示并禁用发送', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '1.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    const amount = screen.getByPlaceholderText('0.0');
    const sendBtn = screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' });

    await user.type(amount, '1..2');
    expect(sendBtn).toBeDisabled();

    await user.clear(amount);
    await user.type(amount, '0');
    expect(sendBtn).toBeDisabled();
  });

  it('点击 MAX 会使用当前余额填充金额', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '3.1415' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    expect(screen.getByPlaceholderText('0.0')).toHaveValue('3.1415');
  });

  it('SAFE 账户在 EVM 链显示提议文案，TRON 链保持广播文案', () => {
    const { rerender } = renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '1.00' }}
        dataSync={syncOk}
        activeAccountType="SAFE"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    expect(screen.getByRole('button', { name: 'PROPOSE_TX' })).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <SendForm
          activeChain={tronChain}
          tokens={[]}
          balances={{ NATIVE: '1.00' }}
          dataSync={syncOk}
          activeAccountType="SAFE"
          onSend={vi.fn(async () => ({ success: true }))}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          isLoading={false}
          transactions={txs}
        />
      </LanguageProvider>
    );

    expect(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' })).toBeInTheDocument();
  });

  it('发送成功后关闭状态页会调用 onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true, hash: '0xok' }))}
        onBack={onBack}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    await user.type(screen.getByPlaceholderText('0.0'), '1');
    await user.click(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' }));
    await screen.findByText('Transmission Confirmed');
    await user.click(screen.getByRole('button', { name: /RETURN_TO_BASE/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('发送失败后关闭状态页会回到表单且不触发 onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '10.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: false, error: 'boom' }))}
        onBack={onBack}
        onRefresh={vi.fn()}
        isLoading={false}
        transactions={txs}
      />
    );

    await user.type(screen.getByPlaceholderText('0x...'), '0x000000000000000000000000000000000000dEaD');
    await user.type(screen.getByPlaceholderText('0.0'), '1');
    await user.click(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' }));
    await screen.findByText('boom');
    await user.click(screen.getByRole('button', { name: /REBOOT_FORM/i }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'BROADCAST_TRANSACTION' })).toBeInTheDocument();
  });

  it('点击刷新按钮会触发 onRefresh', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={[]}
        balances={{ NATIVE: '1.00' }}
        dataSync={syncOk}
        activeAccountType="EOA"
        onSend={vi.fn(async () => ({ success: true }))}
        onBack={vi.fn()}
        onRefresh={onRefresh}
        isLoading={false}
        transactions={txs}
      />
    );

    const refreshBtn = document.querySelector('button.p-1.rounded-md') as HTMLButtonElement | null;
    expect(refreshBtn).toBeTruthy();
    await user.click(refreshBtn!);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
