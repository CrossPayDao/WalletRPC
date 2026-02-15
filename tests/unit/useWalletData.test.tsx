import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ChainConfig, TokenConfig } from '../../features/wallet/types';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { LanguageProvider } from '../../contexts/LanguageContext';

const evmChain: ChainConfig = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: ['https://rpc.bittorrentchain.io'],
  currencySymbol: 'BTT',
  chainType: 'EVM',
  explorers: [],
  tokens: []
};

describe('useWalletData', () => {
  it('当 RPC 返回 rate limited 等错误时，应设置更具体的错误提示（而非一律 data_sync_fault）', async () => {
    const provider = {
      getBalance: vi.fn(async () => {
        throw { status: 429, message: 'Too Many Requests' };
      })
    } as any;

    const setError = vi.fn();
    const setIsLoading = vi.fn();

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x' + '1'.repeat(40) } as any,
          activeAddress: '0x' + '1'.repeat(40),
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [] as TokenConfig[],
          provider,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(setError).toHaveBeenCalled();
    const msg = String(setError.mock.calls.at(-1)?.[0] || '');
    expect(msg).not.toMatch(/Data synchronization fault|数据同步故障/i);
  });
});
