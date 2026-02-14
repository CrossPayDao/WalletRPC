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

const setupMocks = (activeAccountType: 'EOA' | 'SAFE') => {
  const storageMock = {
    trackedSafes: [],
    setTrackedSafes: vi.fn(),
    chains: [chainA, chainB],
    setChains: vi.fn(),
    customTokens: {},
    setCustomTokens: vi.fn(),
    pendingSafeTxs: [],
    setPendingSafeTxs: vi.fn()
  };

  const stateMock = {
    wallet: null,
    tronPrivateKey: null,
    tronWalletAddress: null,
    activeAccountType,
    setActiveAccountType: vi.fn(),
    activeSafeAddress: '0x000000000000000000000000000000000000dEaD',
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
    safeDetails: null,
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

  return { stateMock };
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
});
