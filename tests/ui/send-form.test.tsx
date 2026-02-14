import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendForm, SendFormData } from '../../features/wallet/components/SendForm';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { ChainConfig, TransactionRecord } from '../../features/wallet/types';

const renderWithProvider = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

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

describe('SendForm UI', () => {
  it('挂载时不会自动触发刷新', () => {
    const onRefresh = vi.fn();
    renderWithProvider(
      <SendForm
        activeChain={chain}
        tokens={chain.tokens}
        balances={{ NATIVE: '1.00', [chain.tokens[0].address.toLowerCase()]: '10.00' }}
        activeAccountType="EOA"
        recommendedNonce={0}
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
        activeAccountType="EOA"
        recommendedNonce={0}
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
        activeAccountType="EOA"
        recommendedNonce={0}
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
        activeAccountType="EOA"
        recommendedNonce={0}
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
});
