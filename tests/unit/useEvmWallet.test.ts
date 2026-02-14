import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useEvmWallet } from '../../features/wallet/hooks/useEvmWallet';
import { useWalletStorage } from '../../features/wallet/hooks/useWalletStorage';
import { useWalletState } from '../../features/wallet/hooks/useWalletState';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { useSafeManager } from '../../features/wallet/hooks/useSafeManager';

vi.mock('../../features/wallet/hooks/useWalletStorage', () => ({ useWalletStorage: vi.fn() }));
vi.mock('../../features/wallet/hooks/useWalletState', () => ({ useWalletState: vi.fn() }));
vi.mock('../../features/wallet/hooks/useWalletData', () => ({ useWalletData: vi.fn() }));
vi.mock('../../features/wallet/hooks/useTransactionManager', () => ({ useTransactionManager: vi.fn() }));
vi.mock('../../features/wallet/hooks/useSafeManager', () => ({ useSafeManager: vi.fn() }));

const chainA: ChainConfig = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: ['https://rpc.bittorrentchain.io'],
  currencySymbol: 'BTT',
  chainType: 'EVM',
  explorers: [],
  tokens: []
};

const chainB: ChainConfig = {
  id: 1,
  name: 'Ethereum Mainnet',
  defaultRpcUrl: 'https://eth.llamarpc.com',
  publicRpcUrls: ['https://eth.llamarpc.com'],
  currencySymbol: 'ETH',
  chainType: 'EVM',
  explorers: [],
  tokens: []
};

interface SetupOverrides {
  trackedSafes?: Array<{ address: string; name: string; chainId: number }>;
  pendingSafeTxs?: Array<any>;
  safeDetails?: any;
  activeSafeAddress?: string | null;
}

const setupMocks = (activeAccountType: 'EOA' | 'SAFE', overrides: SetupOverrides = {}) => {
  const storageMock = {
    trackedSafes: overrides.trackedSafes ?? [],
    setTrackedSafes: vi.fn(),
    chains: [chainA, chainB],
    setChains: vi.fn(),
    customTokens: {},
    setCustomTokens: vi.fn(),
    pendingSafeTxs: overrides.pendingSafeTxs ?? [],
    setPendingSafeTxs: vi.fn()
  };

  const stateMock = {
    wallet: null,
    tronPrivateKey: null,
    tronWalletAddress: null,
    activeAccountType,
    setActiveAccountType: vi.fn(),
    activeSafeAddress: overrides.activeSafeAddress ?? '0x000000000000000000000000000000000000dEaD',
    setActiveSafeAddress: vi.fn(),
    activeChainId: 199,
    setActiveChainId: vi.fn(),
    view: 'dashboard',
    setView: vi.fn(),
    error: null,
    setError: vi.fn(),
    notification: null,
    setNotification: vi.fn(),
    tokenToEdit: null,
    setTokenToEdit: vi.fn(),
    isChainModalOpen: false,
    setIsChainModalOpen: vi.fn(),
    isAddTokenModalOpen: false,
    setIsAddTokenModalOpen: vi.fn(),
    handleImport: vi.fn(async () => true),
    privateKeyOrPhrase: '',
    setPrivateKeyOrPhrase: vi.fn(),
    setWallet: vi.fn(),
    isMenuOpen: true,
    setIsMenuOpen: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn()
  };

  const dataMock = {
    fetchData: vi.fn(async () => {}),
    balance: '0.00',
    tokenBalances: {},
    safeDetails: overrides.safeDetails ?? null,
    isInitialFetchDone: true
  };

  const txMgrMock = {
    transactions: [],
    localNonceRef: { current: null },
    handleSendSubmit: vi.fn(async () => ({ success: true })),
    syncNonce: vi.fn(async () => {}),
    addTransactionRecord: vi.fn()
  };

  const safeMgrMock = {
    isDeployingSafe: false,
    handleSafeProposal: vi.fn(async () => true),
    deploySafe: vi.fn(async () => {}),
    handleAddSignature: vi.fn(async () => {}),
    handleExecutePending: vi.fn(async () => {}),
    addOwnerTx: vi.fn(async () => true),
    removeOwnerTx: vi.fn(async () => true),
    changeThresholdTx: vi.fn(async () => true)
  };

  vi.mocked(useWalletStorage).mockReturnValue(storageMock as any);
  vi.mocked(useWalletState).mockReturnValue(stateMock as any);
  vi.mocked(useWalletData).mockReturnValue(dataMock as any);
  vi.mocked(useTransactionManager).mockReturnValue(txMgrMock as any);
  vi.mocked(useSafeManager).mockReturnValue(safeMgrMock as any);

  return { stateMock, dataMock, storageMock };
};

describe('useEvmWallet handleSwitchNetwork', () => {
  it('SAFE 模式切链时重置为 EOA 并清空 activeSafeAddress', () => {
    const { stateMock } = setupMocks('SAFE');
    const { result } = renderHook(() => useEvmWallet());

    act(() => {
      result.current.handleSwitchNetwork(1);
    });

    expect(stateMock.setActiveChainId).toHaveBeenCalledWith(1);
    expect(stateMock.setView).toHaveBeenCalledWith('dashboard');
    expect(stateMock.setIsMenuOpen).toHaveBeenCalledWith(false);
    expect(stateMock.setActiveAccountType).toHaveBeenCalledWith('EOA');
    expect(stateMock.setActiveSafeAddress).toHaveBeenCalledWith(null);
  });

  it('EOA 模式切链不会重复触发 SAFE 重置', () => {
    const { stateMock } = setupMocks('EOA');
    const { result } = renderHook(() => useEvmWallet());

    act(() => {
      result.current.handleSwitchNetwork(1);
    });

    expect(stateMock.setActiveChainId).toHaveBeenCalledWith(1);
    expect(stateMock.setView).toHaveBeenCalledWith('dashboard');
    expect(stateMock.setIsMenuOpen).toHaveBeenCalledWith(false);
    expect(stateMock.setActiveAccountType).not.toHaveBeenCalled();
    expect(stateMock.setActiveSafeAddress).not.toHaveBeenCalled();
  });

  it('handleRefreshData 会触发强制刷新', () => {
    const { stateMock, dataMock } = setupMocks('EOA');

    const { result } = renderHook(() => useEvmWallet());
    act(() => {
      result.current.handleRefreshData();
    });

    expect(stateMock.setActiveAccountType).not.toHaveBeenCalled();
    expect(dataMock.fetchData).toHaveBeenCalledWith(true);
  });

  it('handleTrackSafe 对同链同地址执行去重', () => {
    const existing = {
      address: '0x000000000000000000000000000000000000dEaD',
      name: 'Safe_dead',
      chainId: 199
    };
    const { storageMock } = setupMocks('EOA', { trackedSafes: [existing] });
    const { result } = renderHook(() => useEvmWallet());

    act(() => {
      result.current.handleTrackSafe('0x000000000000000000000000000000000000dead');
    });

    expect(storageMock.setTrackedSafes).toHaveBeenCalledTimes(1);
    const updater = storageMock.setTrackedSafes.mock.calls[0][0] as (prev: typeof existing[]) => typeof existing[];
    const next = updater([existing]);
    expect(next).toHaveLength(1);
  });

  it('SAFE nonce 前进时会清理已过期的 pending 提案', () => {
    const safeAddress = '0x000000000000000000000000000000000000dEaD';
    const pending = [
      { id: 'old', chainId: 199, safeAddress, nonce: 1 },
      { id: 'current', chainId: 199, safeAddress, nonce: 3 },
      { id: 'other-safe', chainId: 199, safeAddress: '0x000000000000000000000000000000000000beef', nonce: 1 },
      { id: 'other-chain', chainId: 1, safeAddress, nonce: 1 }
    ];
    const { storageMock } = setupMocks('SAFE', {
      activeSafeAddress: safeAddress,
      pendingSafeTxs: pending,
      safeDetails: { owners: [], threshold: 2, nonce: 3 }
    });

    renderHook(() => useEvmWallet());

    expect(storageMock.setPendingSafeTxs).toHaveBeenCalled();
    const updater = storageMock.setPendingSafeTxs.mock.calls[0][0] as (prev: typeof pending) => typeof pending;
    const next = updater(pending);
    expect(next.map((item) => item.id)).toEqual(['current', 'other-safe', 'other-chain']);
  });
});
