import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useEvmWallet } from '../../features/wallet/hooks/useEvmWallet';
import { useWalletStorage } from '../../features/wallet/hooks/useWalletStorage';
import { useWalletState } from '../../features/wallet/hooks/useWalletState';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { useSafeManager } from '../../features/wallet/hooks/useSafeManager';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';

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
  safeDetails?: any;
  activeSafeAddress?: string | null;
  wallet?: { address: string } | null;
  unstableFetchData?: boolean;
  customTokens?: Record<number, any[]>;
  chainType?: 'EVM' | 'TRON';
  activeChainId?: number;
  view?: string;
  tronWalletAddress?: string | null;
}

const setupMocks = (activeAccountType: 'EOA' | 'SAFE', overrides: SetupOverrides = {}) => {
  const storageMock = {
    trackedSafes: overrides.trackedSafes ?? [],
    setTrackedSafes: vi.fn(),
    chains: [{ ...chainA, chainType: overrides.chainType ?? 'EVM' }, chainB],
    setChains: vi.fn(),
    customTokens: overrides.customTokens ?? {},
    setCustomTokens: vi.fn()
  };

  const stateMock = {
    wallet: overrides.wallet ?? null,
    tronPrivateKey: null,
    tronWalletAddress: overrides.tronWalletAddress ?? null,
    activeAccountType,
    setActiveAccountType: vi.fn(),
    activeSafeAddress: overrides.activeSafeAddress ?? '0x000000000000000000000000000000000000dEaD',
    setActiveSafeAddress: vi.fn(),
    activeChainId: overrides.activeChainId ?? 199,
    setActiveChainId: vi.fn(),
    view: overrides.view ?? 'dashboard',
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
    clearSession: vi.fn(),
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
    addOwnerTx: vi.fn(async () => true),
    removeOwnerTx: vi.fn(async () => true),
    changeThresholdTx: vi.fn(async () => true)
  };

  vi.mocked(useWalletStorage).mockReturnValue(storageMock as any);
  vi.mocked(useWalletState).mockReturnValue(stateMock as any);
  if (overrides.unstableFetchData) {
    const baseFetchData = dataMock.fetchData;
    vi.mocked(useWalletData).mockImplementation(() => ({
      ...dataMock,
      // 每次 render 提供新函数引用，模拟依赖抖动场景
      fetchData: (...args: unknown[]) => (baseFetchData as any)(...args)
    }) as any);
  } else {
    vi.mocked(useWalletData).mockReturnValue(dataMock as any);
  }
  vi.mocked(useTransactionManager).mockReturnValue(txMgrMock as any);
  vi.mocked(useSafeManager).mockReturnValue(safeMgrMock as any);

  return { stateMock, dataMock, storageMock, txMgrMock, safeMgrMock };
};

describe('useEvmWallet handleSwitchNetwork', () => {
  it('渲染阶段不应主动触发 nonce 同步（避免重复 nonce RPC）', () => {
    const { stateMock, txMgrMock } = setupMocks('EOA');
    renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    // useEvmWallet 不应在渲染/挂载阶段主动调用 txMgr.syncNonce
    expect(txMgrMock.syncNonce).not.toHaveBeenCalled();
    expect(stateMock.setError).not.toHaveBeenCalled();
  });

  it('同一 dashboard 事件上下文下不应因 fetchData 引用变化而循环请求', () => {
    const { dataMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      unstableFetchData: true
    });
    const { rerender } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    rerender();
    rerender();

    expect(dataMock.fetchData).toHaveBeenCalledTimes(1);
    expect(dataMock.fetchData).toHaveBeenCalledWith(false);
  });

  it('SAFE 模式切链时重置为 EOA 并清空 activeSafeAddress', () => {
    const { stateMock } = setupMocks('SAFE');
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

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
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

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

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
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
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleTrackSafe('0x000000000000000000000000000000000000dead');
    });

    expect(storageMock.setTrackedSafes).toHaveBeenCalledTimes(1);
    const updater = storageMock.setTrackedSafes.mock.calls[0][0] as (prev: typeof existing[]) => typeof existing[];
    const next = updater([existing]);
    expect(next).toHaveLength(1);
  });

  it('非 TRON 链调用 handleOpenTronFinance 时不应切换视图', () => {
    const { stateMock } = setupMocks('EOA');
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleOpenTronFinance();
    });

    expect(stateMock.setView).not.toHaveBeenCalledWith('tron_finance');
  });

  it('TRON 链调用 handleOpenTronFinance 会切到 tron_finance', () => {
    const { stateMock, storageMock } = setupMocks('EOA');
    storageMock.chains = [{ ...chainA, chainType: 'TRON' }];
    stateMock.activeChainId = chainA.id;

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleOpenTronFinance();
    });

    expect(stateMock.setView).toHaveBeenCalledWith('tron_finance');
  });

  it('handleLogout 会清理会话并清空交易', () => {
    const { stateMock, txMgrMock } = setupMocks('EOA');
    stateMock.clearSession = vi.fn();
    txMgrMock.clearTransactions = vi.fn();
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleLogout();
    });

    expect(stateMock.clearSession).toHaveBeenCalled();
    expect(txMgrMock.clearTransactions).toHaveBeenCalled();
  });

  it('confirmAddToken 对非法地址直接报错', async () => {
    const { stateMock } = setupMocks('EOA', { wallet: { address: '0x000000000000000000000000000000000000beef' } });

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.confirmAddToken('invalid');
    });

    expect(stateMock.setError).toHaveBeenCalled();
  });

  it('confirmAddToken 对重复地址报错并拒绝导入', async () => {
    const duplicate = '0x00000000000000000000000000000000000000aa';
    const { stateMock, storageMock } = setupMocks('EOA', { wallet: { address: '0x000000000000000000000000000000000000beef' } });
    storageMock.customTokens = {
      [chainA.id]: [{ address: duplicate, symbol: 'DUP', name: 'Dup', decimals: 18, isCustom: true }]
    };

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.confirmAddToken(duplicate);
    });

    expect(stateMock.setError).toHaveBeenCalled();
  });

  it('handleUpdateToken / handleRemoveToken 会更新 customTokens 并提示', () => {
    const { stateMock, storageMock } = setupMocks('EOA');
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleUpdateToken({
        address: '0x00000000000000000000000000000000000000aa',
        symbol: 'NEW',
        name: 'New Name',
        decimals: 18,
        isCustom: true
      } as any);
    });
    expect(storageMock.setCustomTokens).toHaveBeenCalled();
    expect(stateMock.setTokenToEdit).toHaveBeenCalledWith(null);
    expect(stateMock.setNotification).toHaveBeenCalled();

    act(() => {
      result.current.handleRemoveToken('0x00000000000000000000000000000000000000aa');
    });
    expect(storageMock.setCustomTokens).toHaveBeenCalled();
    expect(stateMock.setTokenToEdit).toHaveBeenCalledWith(null);
    expect(stateMock.setNotification).toHaveBeenCalled();
  });

  it('confirmAddToken 在 TRON 链(无 provider)时直接返回', async () => {
    const { stateMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      chainType: 'TRON'
    });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    await act(async () => {
      await result.current.confirmAddToken('TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf');
    });

    expect(stateMock.setError).not.toHaveBeenCalled();
  });

  it('confirmAddToken 合约读取失败时会提示失败', async () => {
    const { stateMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' }
    });
    const oldFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'rpc failed' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    await act(async () => {
      await result.current.confirmAddToken('0x00000000000000000000000000000000000000cd');
    });

    expect(stateMock.setError).toHaveBeenCalled();
    expect(stateMock.setIsLoading).toHaveBeenCalledWith(false);
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', oldFetch);
  });

  it('handleUpdateToken / handleRemoveToken 在已有列表上执行 map 与 filter', () => {
    const addressA = '0x00000000000000000000000000000000000000aa';
    const addressB = '0x00000000000000000000000000000000000000bb';
    const { storageMock } = setupMocks('EOA', {
      customTokens: {
        [chainA.id]: [
          { address: addressA, symbol: 'A', name: 'Token A', decimals: 18, isCustom: true },
          { address: addressB, symbol: 'B', name: 'Token B', decimals: 18, isCustom: true }
        ]
      }
    });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    act(() => {
      result.current.handleUpdateToken({
        address: addressA,
        symbol: 'A2',
        name: 'Token A2',
        decimals: 18,
        isCustom: true
      } as any);
    });
    const updateUpdater = storageMock.setCustomTokens.mock.calls.at(-1)?.[0] as (prev: Record<number, any[]>) => Record<number, any[]>;
    const updated = updateUpdater(storageMock.customTokens);
    expect(updated[chainA.id].find((x) => x.address === addressA)?.symbol).toBe('A2');

    act(() => {
      result.current.handleRemoveToken(addressB);
    });
    const removeUpdater = storageMock.setCustomTokens.mock.calls.at(-1)?.[0] as (prev: Record<number, any[]>) => Record<number, any[]>;
    const removed = removeUpdater(updated);
    expect(removed[chainA.id].some((x) => x.address === addressB)).toBe(false);
  });

  it('handleSaveChain 会写入自定义链配置并关闭弹窗', () => {
    const { stateMock, storageMock } = setupMocks('EOA');
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    const updatedChain = { ...chainA, defaultRpcUrl: 'https://rpc.changed.local' };

    act(() => {
      result.current.handleSaveChain(updatedChain);
    });

    expect(storageMock.setChains).toHaveBeenCalledTimes(1);
    const updater = storageMock.setChains.mock.calls[0][0] as (prev: ChainConfig[]) => ChainConfig[];
    const nextChains = updater(storageMock.chains);
    const saved = nextChains.find((x) => x.id === updatedChain.id);
    expect(saved?.defaultRpcUrl).toBe('https://rpc.changed.local');
    expect(saved?.isCustom).toBe(true);
    expect(stateMock.setIsChainModalOpen).toHaveBeenCalledWith(false);
    expect(stateMock.setNotification).toHaveBeenCalled();
  });

  it('handleTrackSafe 首次添加时会切到 SAFE 上下文', () => {
    const { stateMock, storageMock } = setupMocks('EOA', { trackedSafes: [] });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    const safeAddress = '0x000000000000000000000000000000000000c0de';

    act(() => {
      result.current.handleTrackSafe(safeAddress);
    });

    const updater = storageMock.setTrackedSafes.mock.calls[0][0] as (prev: Array<{ address: string; name: string; chainId: number }>) => Array<{ address: string; name: string; chainId: number }>;
    const next = updater([]);
    expect(next).toHaveLength(1);
    expect(next[0].address).toBe(safeAddress);
    expect(next[0].name).toBe('Safe_0000');
    expect(stateMock.setActiveSafeAddress).toHaveBeenCalledWith(safeAddress);
    expect(stateMock.setActiveAccountType).toHaveBeenCalledWith('SAFE');
    expect(stateMock.setView).toHaveBeenCalledWith('dashboard');
  });

  it('intro_animation 下自动探测到其他 TRON 链有余额时会切链', async () => {
    const tronActive: ChainConfig = {
      id: 728126428,
      name: 'TRON Nile',
      defaultRpcUrl: 'https://nile.trongrid.io',
      publicRpcUrls: ['https://nile.trongrid.io'],
      currencySymbol: 'TRX',
      chainType: 'TRON',
      explorers: [],
      tokens: []
    };
    const tronTarget: ChainConfig = {
      ...tronActive,
      id: 3448148188,
      name: 'TRON Mainnet',
      defaultRpcUrl: 'https://api.trongrid.io',
      publicRpcUrls: ['https://api.trongrid.io']
    };
    const { stateMock, storageMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      tronWalletAddress: 'TKxFAZWkATzrk4vXkSaCKpmiuSDavz...',
      view: 'intro_animation',
      activeChainId: tronActive.id
    });
    storageMock.chains = [tronActive, tronTarget];

    const normalizeSpy = vi.spyOn(TronService, 'normalizeHost').mockImplementation((v) => v);
    const getBalanceSpy = vi
      .spyOn(TronService, 'getBalance')
      .mockImplementation(async (host: string) => (host.includes('nile') ? 0n : 12n));

    renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    await waitFor(() => {
      expect(stateMock.setActiveChainId).toHaveBeenCalledWith(tronTarget.id);
    });
    expect(normalizeSpy).toHaveBeenCalled();
    expect(getBalanceSpy).toHaveBeenCalled();
  });

  it('intro_animation 且首轮同步完成后 isIntroPreflightDone 置为 true', async () => {
    setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      tronWalletAddress: 'TKxFAZWkATzrk4vXkSaCKpmiuSDavz...',
      view: 'intro_animation',
      chainType: 'TRON'
    });

    vi.spyOn(TronService, 'normalizeHost').mockImplementation((v) => v);
    vi.spyOn(TronService, 'getBalance').mockResolvedValue(0n);

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    await waitFor(() => {
      expect(result.current.isIntroPreflightDone).toBe(true);
    });
  });

  it('非核心视图下不应触发 fetchData 事件刷新', () => {
    const { dataMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      view: 'settings'
    });
    renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    expect(dataMock.fetchData).not.toHaveBeenCalled();
  });

  it('activeChainId 不存在时应回退到 chains[0]', () => {
    setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' },
      activeChainId: 999999
    });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    expect(result.current.activeChain.id).toBe(chainA.id);
  });

  it('无钱包时 activeAddress 应为空且 introPreflight 保持 false', () => {
    setupMocks('EOA', { wallet: null, view: 'intro_animation' });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    expect(result.current.activeAddress).toBeNull();
    expect(result.current.isIntroPreflightDone).toBe(false);
  });

  it('confirmAddToken 在空地址时应直接返回且不报错', async () => {
    const { stateMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' }
    });
    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

    await act(async () => {
      await result.current.confirmAddToken('');
    });
    expect(stateMock.setError).not.toHaveBeenCalled();
  });

  it('非 TRON 且 rpc 缺失时 provider 应为 null', () => {
    const { storageMock, stateMock } = setupMocks('EOA', {
      wallet: { address: '0x000000000000000000000000000000000000beef' }
    });
    storageMock.chains = [{ ...chainA, defaultRpcUrl: '' }];
    stateMock.activeChainId = chainA.id;

    const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });
    expect(result.current.provider).toBeNull();
  });

});
