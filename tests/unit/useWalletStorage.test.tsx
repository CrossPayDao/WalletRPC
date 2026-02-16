import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWalletStorage } from '../../features/wallet/hooks/useWalletStorage';
import { DEFAULT_CHAINS } from '../../features/wallet/config';

describe('useWalletStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('恢复链配置时保留用户 override 且使用最新 explorers', async () => {
    const defaultChain = DEFAULT_CHAINS[0];

    localStorage.setItem('zerostate_custom_chains', JSON.stringify([
      {
        id: defaultChain.id,
        name: `${defaultChain.name} Custom`,
        defaultRpcUrl: 'https://custom-rpc.local',
        publicRpcUrls: ['https://custom-rpc.local'],
        currencySymbol: defaultChain.currencySymbol,
        chainType: defaultChain.chainType,
        explorers: [
          {
            name: 'OldExplorer',
            key: 'old',
            url: 'https://old.invalid',
            txPath: 'https://old.invalid/tx/{txid}',
            addressPath: 'https://old.invalid/address/{address}'
          }
        ],
        tokens: []
      },
      {
        id: 99999,
        name: 'User Added Chain',
        defaultRpcUrl: 'https://added.local',
        publicRpcUrls: ['https://added.local'],
        currencySymbol: 'UAC',
        chainType: 'EVM',
        explorers: [],
        tokens: [],
        isCustom: true
      }
    ]));

    const { result } = renderHook(() => useWalletStorage());

    await waitFor(() => {
      const restored = result.current.chains.find(c => c.id === defaultChain.id);
      expect(restored).toBeTruthy();
      expect(restored?.defaultRpcUrl).toBe('https://custom-rpc.local');
      expect(restored?.explorers).toEqual(defaultChain.explorers);
      expect(restored?.isCustom).toBe(true);
    });

    expect(result.current.chains.some(c => c.id === 99999)).toBe(true);
    // 应迁移到新 key
    expect(localStorage.getItem('walletrpc_custom_chains')).toContain('custom-rpc.local');
    expect(localStorage.getItem('zerostate_custom_chains')).toBeNull();
  });

  it('状态变更会自动回写 localStorage', async () => {
    const { result } = renderHook(() => useWalletStorage());

    act(() => {
      result.current.setTrackedSafes([
        {
          address: '0x000000000000000000000000000000000000dEaD',
          name: 'Safe_dead',
          chainId: DEFAULT_CHAINS[0].id
        }
      ]);
    });

    await waitFor(() => {
      const saved = localStorage.getItem('walletrpc_tracked_safes');
      expect(saved).toContain('Safe_dead');
    });
    expect(localStorage.getItem('zerostate_tracked_safes')).toBeNull();
  });

  it('单个损坏的存储 key 不会阻断其他 key 的恢复', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('zerostate_custom_chains', '{bad json');
    localStorage.setItem('zerostate_tracked_safes', JSON.stringify([
      {
        address: '0x000000000000000000000000000000000000dEaD',
        name: 'Safe_dead',
        chainId: DEFAULT_CHAINS[0].id
      }
    ]));

    const { result } = renderHook(() => useWalletStorage());

    await waitFor(() => {
      expect(result.current.trackedSafes).toHaveLength(1);
      expect(result.current.trackedSafes[0].name).toBe('Safe_dead');
    });
    expect(result.current.chains[0].id).toBe(DEFAULT_CHAINS[0].id);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('恢复 trackedSafes 时可从 legacy key 迁移到新 key', async () => {
    localStorage.setItem('zerostate_tracked_safes', JSON.stringify([
      { address: '0x000000000000000000000000000000000000dEaD', name: 'Safe_dead', chainId: DEFAULT_CHAINS[0].id }
    ]));

    const { result } = renderHook(() => useWalletStorage());

    await waitFor(() => {
      expect(result.current.trackedSafes).toHaveLength(1);
      expect(result.current.trackedSafes[0].name).toBe('Safe_dead');
    });

    expect(localStorage.getItem('walletrpc_tracked_safes')).toContain('Safe_dead');
    expect(localStorage.getItem('zerostate_tracked_safes')).toBeNull();
  });

  it('localStorage 不可用时不应崩溃，且状态更新仍能生效', async () => {
    const getSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { result } = renderHook(() => useWalletStorage());

    act(() => {
      result.current.setTrackedSafes([
        { address: '0x000000000000000000000000000000000000dEaD', name: 'Safe_dead', chainId: DEFAULT_CHAINS[0].id }
      ]);
    });

    await waitFor(() => {
      expect(result.current.trackedSafes).toHaveLength(1);
      expect(result.current.trackedSafes[0].name).toBe('Safe_dead');
    });

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('current key 损坏时会回退 legacy 并迁移 customTokens', async () => {
    const tokenData = { [DEFAULT_CHAINS[0].id]: [{ symbol: 'USDT', address: '0x1', decimals: 6 }] };
    localStorage.setItem('walletrpc_custom_tokens', '{bad json');
    localStorage.setItem('zerostate_custom_tokens', JSON.stringify(tokenData));

    const { result } = renderHook(() => useWalletStorage());

    await waitFor(() => {
      expect(result.current.customTokens[DEFAULT_CHAINS[0].id]?.[0]?.symbol).toBe('USDT');
    });
    expect(localStorage.getItem('walletrpc_custom_tokens')).toContain('USDT');
    expect(localStorage.getItem('zerostate_custom_tokens')).toBeNull();
  });

  it('current key 为空字符串时会走 fallback 且不污染状态', async () => {
    localStorage.setItem('walletrpc_tracked_safes', '');
    localStorage.setItem('walletrpc_custom_chains', '');

    const { result } = renderHook(() => useWalletStorage());

    await waitFor(() => {
      expect(result.current.trackedSafes).toEqual([]);
      expect(result.current.chains.length).toBeGreaterThan(0);
    });
  });
});
