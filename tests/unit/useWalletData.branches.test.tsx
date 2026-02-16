import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';
import type { ChainConfig, TokenConfig } from '../../features/wallet/types';

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

const tronToken: TokenConfig = {
  symbol: 'USDT',
  name: 'Tether',
  address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  decimals: 6
};

describe('useWalletData branches', () => {
  it('TRON token 查询失败时保留上一次已知余额，避免误置 0', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();

    const getBalanceSpy = vi.spyOn(TronService, 'getBalance');
    const getTokenSpy = vi.spyOn(TronService, 'getTRC20Balance');

    getBalanceSpy.mockResolvedValue(3_500_000n);
    getTokenSpy.mockResolvedValueOnce(1_234_567n).mockRejectedValueOnce(new Error('rpc down'));

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any,
          activeAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
          activeChain: tronChain,
          activeAccountType: 'EOA',
          activeChainTokens: [tronToken],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    const key = tronToken.address.toLowerCase();
    expect(result.current.tokenBalances[key]).toBe('1.234567');

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.tokenBalances[key]).toBe('1.234567');
    expect(setError).not.toHaveBeenCalled();
  });

  it('TRON 原生余额查询失败时进入 error phase 并给出同步错误', async () => {
    const setError = vi.fn();
    const setIsLoading = vi.fn();

    vi.spyOn(TronService, 'getBalance').mockRejectedValue(new Error('network failed'));
    vi.spyOn(TronService, 'getTRC20Balance').mockResolvedValue(0n);

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } as any,
          activeAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
          activeChain: tronChain,
          activeAccountType: 'EOA',
          activeChainTokens: [tronToken],
          provider: null,
          setIsLoading,
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    await waitFor(() => {
      expect(result.current.sync.phase).toBe('error');
      expect(result.current.sync.error).toBeTruthy();
    });

    expect(setError).toHaveBeenCalled();
  });
});
