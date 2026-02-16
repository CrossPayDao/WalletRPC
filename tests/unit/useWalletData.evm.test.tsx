import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../contexts/LanguageContext';
import type { ChainConfig, TokenConfig } from '../../features/wallet/types';

const mocked = vi.hoisted(() => ({
  contractCtor: vi.fn()
}));

vi.mock('ethers', async () => {
  const actual = await vi.importActual<any>('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: mocked.contractCtor
    }
  };
});

import { useWalletData } from '../../features/wallet/hooks/useWalletData';

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

const tokenA: TokenConfig = {
  symbol: 'AAA',
  name: 'Token AAA',
  address: '0x00000000000000000000000000000000000000aa',
  decimals: 18
};

describe('useWalletData (EVM branches)', () => {
  beforeEach(() => {
    mocked.contractCtor.mockReset();
  });

  it('SAFE 模式 + 合约地址会抓取 owners/threshold/nonce 并更新 safeDetails', async () => {
    const provider = {
      getBalance: vi.fn(async () => 10_000_000_000_000_000n),
      getCode: vi.fn(async () => '0x1234')
    } as any;

    mocked.contractCtor.mockImplementation(function (address: string) {
      if (address.toLowerCase() === '0x000000000000000000000000000000000000dead') {
        return {
          getOwners: vi.fn(async () => ['0x0000000000000000000000000000000000000001']),
          getThreshold: vi.fn(async () => 1n),
          nonce: vi.fn(async () => 9n)
        };
      }
      return {
        balanceOf: vi.fn(async () => 0n)
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000dEaD',
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [tokenA],
          provider,
          setIsLoading: vi.fn(),
          setError: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.safeDetails).toEqual({
      owners: ['0x0000000000000000000000000000000000000001'],
      threshold: 1,
      nonce: 9
    });
  });

  it('ERC20 balanceOf 失败时回退到上一次 token 余额（非误置 0）', async () => {
    const provider = {
      getBalance: vi.fn(async () => 1_000_000_000_000_000_000n),
      getCode: vi.fn(async () => '0x')
    } as any;

    let first = true;
    mocked.contractCtor.mockImplementation(function () {
      return {
        balanceOf: vi.fn(async () => {
          if (first) {
            first = false;
            return 2_000_000_000_000_000_000n;
          }
          throw new Error('rpc token failed');
        })
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000beef',
          activeChain: evmChain,
          activeAccountType: 'EOA',
          activeChainTokens: [tokenA],
          provider,
          setIsLoading: vi.fn(),
          setError: vi.fn()
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });
    const key = tokenA.address.toLowerCase();
    const prev = result.current.tokenBalances[key];
    expect(prev).toBeTruthy();

    await act(async () => {
      await result.current.fetchData(true);
    });

    expect(result.current.tokenBalances[key]).toBe(prev);
  });

  it('refreshSafeDetails force 模式失败时会透出友好错误', async () => {
    const setError = vi.fn();
    const provider = {
      getBalance: vi.fn(async () => 1n),
      getCode: vi.fn(async () => '0x1234')
    } as any;

    mocked.contractCtor.mockImplementation(function (address: string) {
      if (address.toLowerCase() === '0x000000000000000000000000000000000000dead') {
        return {
          getOwners: vi.fn(async () => {
            throw new Error('boom');
          }),
          getThreshold: vi.fn(async () => 1n),
          nonce: vi.fn(async () => 1n)
        };
      }
      return {
        balanceOf: vi.fn(async () => 0n)
      };
    });

    const { result } = renderHook(
      () =>
        useWalletData({
          wallet: { address: '0x000000000000000000000000000000000000beef' } as any,
          activeAddress: '0x000000000000000000000000000000000000dEaD',
          activeChain: evmChain,
          activeAccountType: 'SAFE',
          activeChainTokens: [tokenA],
          provider,
          setIsLoading: vi.fn(),
          setError
        }),
      { wrapper: LanguageProvider }
    );

    await act(async () => {
      await result.current.fetchData(true);
    });

    await act(async () => {
      await result.current.refreshSafeDetails(true);
    });

    await waitFor(() => {
      expect(setError).toHaveBeenCalled();
    });
  });
});
