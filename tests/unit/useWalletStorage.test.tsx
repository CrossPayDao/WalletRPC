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
      const saved = localStorage.getItem('zerostate_tracked_safes');
      expect(saved).toContain('Safe_dead');
    });
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
});
