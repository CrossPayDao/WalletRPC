
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useWalletStorage } from './useWalletStorage';
import { useWalletState } from './useWalletState';
import { useWalletData } from './useWalletData';
import { useTransactionManager } from './useTransactionManager';
import { useSafeManager } from './useSafeManager';
import { ChainConfig, TokenConfig } from '../types';
import { ERC20_ABI } from '../config';
import { useTranslation } from '../../../contexts/LanguageContext';
import { TronService } from '../../../services/tronService';

/**
 * 【核心技术：带缓存的智能 RPC 提供者 (Memoized RPC Provider)】
 * 
 * 解决痛点：Ethers 在内部处理 "latest" 块或 Gas 估算时，即使我们手动合并了 Promise，
 * 它也可能因为第一个请求刚结束，第二个请求又发起的微小时间差导致冗余网络开销。
 */
class DeduplicatingJsonRpcProvider extends ethers.JsonRpcProvider {
  // 正在进行的请求（并发去重）
  private _inflight = new Map<string, Promise<any>>();
  // 已完成请求的短期缓存（时间片去重）
  private _resCache = new Map<string, { result: any, expiry: number }>();
  
  private readonly CACHE_TTL = 2000; // 2秒缓存生命周期
  private readonly MAX_CACHE_SIZE = 200;

  private cleanupCache(now: number) {
    for (const [key, value] of this._resCache) {
      if (value.expiry <= now) this._resCache.delete(key);
    }
    while (this._resCache.size > this.MAX_CACHE_SIZE) {
      const first = this._resCache.keys().next();
      if (first.done) break;
      this._resCache.delete(first.value);
    }
  }

  async send(method: string, params: Array<any>): Promise<any> {
    // 只有查询类方法值得缓存/去重
    // 移除了 eth_chainId，因为 Chain ID 在配置中已固定
    // 注意：余额/nonce 属于强时序数据，只做并发去重，不做时间片缓存，避免强制刷新拿到旧值。
    const resCacheMethods = [
      'eth_gasPrice', 
      'eth_maxPriorityFeePerGas', 
      'eth_getBlockByNumber', 
      'eth_feeHistory'
    ];
    const inflightOnlyMethods = [
      'eth_getBalance',
      'eth_getTransactionCount'
    ];

    if (!resCacheMethods.includes(method) && !inflightOnlyMethods.includes(method)) {
      return super.send(method, params);
    }

    const key = `${method}:${JSON.stringify(params)}`;
    const now = Date.now();
    this.cleanupCache(now);

    // 1. 检查结果缓存 (解决 ID 不同但内容相同的重复请求)
    if (resCacheMethods.includes(method)) {
      const cached = this._resCache.get(key);
      if (cached && cached.expiry > now) {
        return cached.result;
      }
    }

    // 2. 检查并发锁定 (解决同一瞬间的请求)
    const existingPromise = this._inflight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // 3. 执行真正的网络请求
    const promise = super.send(method, params).then(result => {
      if (resCacheMethods.includes(method)) {
        // 存入短期结果缓存
        this._resCache.set(key, { 
          result, 
          expiry: Date.now() + this.CACHE_TTL 
        });
        this.cleanupCache(Date.now());
      }
      return result;
    }).finally(() => {
      // 释放并发锁定
      this._inflight.delete(key);
    });

    this._inflight.set(key, promise);
    return promise;
  }
}

export const useEvmWallet = () => {
  const { t } = useTranslation();
  const storage = useWalletStorage();
  const { 
    setTrackedSafes, chains, setChains, 
    customTokens, setCustomTokens
  } = storage;
  
  const initialChainId = chains.length > 0 ? chains[0].id : 1;
  const state = useWalletState(initialChainId);
  const { 
    wallet, tronPrivateKey, tronWalletAddress, activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, view, setView, setError, setNotification,
    setTokenToEdit, setIsChainModalOpen, setIsAddTokenModalOpen,
    clearSession, setIsMenuOpen, setIsLoading,
  } = state;

  const autoDetectRanRef = useRef(false);
  const [isAutoDetectingChain, setIsAutoDetectingChain] = useState(false);

  const activeChain = useMemo(() => {
    return chains.find(c => c.id === activeChainId) || chains[0];
  }, [chains, activeChainId]);

  const activeAddress = useMemo(() => {
    if (!wallet) return null;
    if (activeAccountType === 'SAFE') return activeSafeAddress;
    return activeChain.chainType === 'TRON' ? state.tronWalletAddress : wallet.address;
  }, [wallet, activeAccountType, activeSafeAddress, activeChain, state.tronWalletAddress]);

  const provider = useMemo(() => {
    if (activeChain.chainType === 'TRON' || !activeChain.defaultRpcUrl) return null;
    
    const network = ethers.Network.from(activeChain.id);
    return new DeduplicatingJsonRpcProvider(activeChain.defaultRpcUrl, network, {
      staticNetwork: network
    });
  }, [activeChain]);

  const activeChainTokens = useMemo(() => {
    const merged = [...(activeChain.tokens || []), ...(customTokens[activeChainId] || [])];
    const deduped = new Map<string, TokenConfig>();
    merged.forEach(token => {
      deduped.set(token.address.toLowerCase(), token);
    });
    return Array.from(deduped.values());
  }, [activeChain, customTokens, activeChainId]);

  const dataLayer = useWalletData({
    wallet, activeAddress, activeChain, activeAccountType,
    activeChainTokens, provider, setIsLoading, setError
  });

  const { fetchData, safeDetails } = dataLayer;

  const safeHandlerRef = useRef<any>(null);
  const txMgr = useTransactionManager({
    wallet, 
    tronPrivateKey,
    provider, activeChain, activeChainId,
    activeAccountType,
    fetchData, setError,
    handleSafeProposal: async (t: string, v: bigint, d: string, s: string) => { 
        if (safeHandlerRef.current) return await safeHandlerRef.current(t, v, d, s); 
        return false;
    }
  });

  const safeMgr = useSafeManager({
    wallet, activeSafeAddress, activeChainId, activeChain, provider,
    setTrackedSafes, setActiveAccountType, setActiveSafeAddress,
    setView, setNotification, setError,
    addTransactionRecord: txMgr.addTransactionRecord
  });

  useEffect(() => { 
    if (safeMgr && safeMgr.handleSafeProposal) {
      safeHandlerRef.current = safeMgr.handleSafeProposal; 
    }
  }, [safeMgr?.handleSafeProposal]);

  // During the intro animation we may auto-detect which chain has assets.
  // To avoid a "double fetch" (default chain then detected chain), we gate the initial fetch until detection completes.
  useEffect(() => {
    const isCoreView = view === 'intro_animation' || view === 'dashboard';
    if (wallet && isCoreView && !isAutoDetectingChain) {
      fetchData(false);
      if (activeChain.chainType !== 'TRON') txMgr.syncNonce();
    }
  }, [activeChainId, activeAccountType, activeSafeAddress, wallet, view, activeChain.chainType, isAutoDetectingChain]);

  useEffect(() => {
    const run = async () => {
      // Only run right after import, while the intro animation is playing, in EOA context.
      if (!wallet) return;
      if (view !== 'intro_animation') return;
      if (activeAccountType !== 'EOA') return;
      if (autoDetectRanRef.current) return;
      autoDetectRanRef.current = true;

      // If we can't derive addresses or chains are empty, just let normal fetch proceed.
      if (!chains || chains.length === 0) return;
      const evmAddr = wallet.address;
      const tronAddr = tronWalletAddress;
      if (!evmAddr && !tronAddr) return;

      setIsAutoDetectingChain(true);
      try {
        // Prefer the currently selected chain first to minimize surprises.
        const ordered = [
          ...(chains.find((c) => c.id === activeChainId) ? [chains.find((c) => c.id === activeChainId)!] : []),
          ...chains.filter((c) => c.id !== activeChainId)
        ];

        const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
          return await Promise.race([
            p,
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
          ]);
        };

        for (const c of ordered) {
          try {
            if (c.chainType === 'TRON') {
              if (!tronAddr || !c.defaultRpcUrl) continue;
              const host = TronService.normalizeHost(c.defaultRpcUrl);
              const balSun = await withTimeout(TronService.getBalance(host, tronAddr), 5000);
              if (typeof balSun === 'bigint' && balSun > 0n) {
                if (c.id !== activeChainId) setActiveChainId(c.id);
                return;
              }
              continue;
            }

            if (!c.defaultRpcUrl) continue;
            const network = ethers.Network.from(c.id);
            const p = new ethers.JsonRpcProvider(c.defaultRpcUrl, network, { staticNetwork: network });
            const balWei = await withTimeout(p.getBalance(evmAddr), 5000);
            if (typeof balWei === 'bigint' && balWei > 0n) {
              if (c.id !== activeChainId) setActiveChainId(c.id);
              return;
            }
          } catch {
            // Ignore this chain and continue probing the next.
          }
        }
      } finally {
        setIsAutoDetectingChain(false);
      }
    };

    run();
  }, [wallet, tronWalletAddress, chains, view, activeAccountType, activeChainId, setActiveChainId]);

  const handleSaveChain = (config: ChainConfig) => {
    setChains(prev => prev.map(c => c.id === config.id ? { ...config, isCustom: true } : c));
    setIsChainModalOpen(false);
    setNotification(t('wallet.network_node_updated'));
  };

  const handleTrackSafe = (address: string) => {
    const name = `Safe_${address.slice(2, 6)}`;
    const normalizedAddress = address.toLowerCase();
    setTrackedSafes((prev) => {
      const exists = prev.some(
        (safe) =>
          safe.chainId === activeChainId &&
          safe.address.toLowerCase() === normalizedAddress
      );
      if (exists) return prev;
      return [...prev, { address, name, chainId: activeChainId }];
    });
    setActiveSafeAddress(address);
    setActiveAccountType('SAFE');
    setView('dashboard');
  };

  const handleSwitchNetwork = useCallback((chainId: number) => {
    setActiveChainId(chainId);
    setView('dashboard');
    setIsMenuOpen(false);
    if (activeAccountType === 'SAFE') {
      setActiveAccountType('EOA');
      setActiveSafeAddress(null);
    }
  }, [activeAccountType, setActiveAccountType, setActiveChainId, setActiveSafeAddress, setIsMenuOpen, setView]);

  const handleLogout = useCallback(() => {
    clearSession();
    txMgr.clearTransactions();
  }, [clearSession, txMgr]);

  const handleRefreshData = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const confirmAddToken = async (address: string) => {
    if (!provider || !address) return;
    if (!ethers.isAddress(address)) {
      setError(t('wallet.invalid_token_address'));
      return;
    }
    const normalized = address.toLowerCase();
    if (activeChainTokens.some(t => t.address.toLowerCase() === normalized)) {
      setError(t('wallet.token_already_exists'));
      return;
    }
    setIsLoading(true);
    try {
      const contract = new ethers.Contract(address, ERC20_ABI, provider);
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);
      const newToken: TokenConfig = { address, name, symbol, decimals: Number(decimals), isCustom: true };
      setCustomTokens(prev => ({
        ...prev,
        [activeChainId]: [...(prev[activeChainId] || []), newToken]
      }));
      setIsAddTokenModalOpen(false);
      setNotification(`${t('wallet.token_imported')}: ${symbol}`);
    } catch (e) {
      setError(t('wallet.token_import_failed'));
    } finally { setIsLoading(false); }
  };

  const handleUpdateToken = (token: TokenConfig) => {
    setCustomTokens(prev => ({
      ...prev,
      [activeChainId]: (prev[activeChainId] || []).map(t => t.address === token.address ? token : t)
    }));
    setTokenToEdit(null);
    setNotification(t('wallet.token_updated'));
  };

  const handleRemoveToken = (address: string) => {
    setCustomTokens(prev => ({
      ...prev,
      [activeChainId]: (prev[activeChainId] || []).filter(t => t.address !== address)
    }));
    setTokenToEdit(null);
    setNotification(t('wallet.token_removed'));
  };

  return { 
    ...state, ...dataLayer, ...txMgr, ...safeMgr, ...storage,
    activeChain, activeAddress, activeChainTokens, provider,
    handleSaveChain, handleTrackSafe, handleSwitchNetwork, handleLogout, handleRefreshData, confirmAddToken, handleUpdateToken, handleRemoveToken,
    currentNonce: safeDetails?.nonce || 0
  };
};
