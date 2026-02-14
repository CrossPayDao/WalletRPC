
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { useWalletStorage } from './useWalletStorage';
import { useWalletState } from './useWalletState';
import { useWalletData } from './useWalletData';
import { useTransactionManager } from './useTransactionManager';
import { useSafeManager } from './useSafeManager';
import { ChainConfig, TokenConfig } from '../types';
import { ERC20_ABI } from '../config';

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

  async send(method: string, params: Array<any>): Promise<any> {
    // 只有查询类方法值得缓存
    // 移除了 eth_chainId，因为 Chain ID 在配置中已固定
    const cacheableMethods = [
      'eth_gasPrice', 
      'eth_maxPriorityFeePerGas', 
      'eth_getBlockByNumber', 
      'eth_feeHistory',
      'eth_getBalance',
      'eth_getTransactionCount'
    ];

    if (!cacheableMethods.includes(method)) {
      return super.send(method, params);
    }

    const key = `${method}:${JSON.stringify(params)}`;
    const now = Date.now();

    // 1. 检查结果缓存 (解决 ID 不同但内容相同的重复请求)
    const cached = this._resCache.get(key);
    if (cached && cached.expiry > now) {
      return cached.result;
    }

    // 2. 检查并发锁定 (解决同一瞬间的请求)
    const existingPromise = this._inflight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // 3. 执行真正的网络请求
    const promise = super.send(method, params).then(result => {
      // 存入短期结果缓存
      this._resCache.set(key, { 
        result, 
        expiry: Date.now() + this.CACHE_TTL 
      });
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
  const storage = useWalletStorage();
  const { 
    trackedSafes, setTrackedSafes, chains, setChains, 
    customTokens, setCustomTokens, pendingSafeTxs, setPendingSafeTxs 
  } = storage;
  
  const initialChainId = chains.length > 0 ? chains[0].id : 1;
  const state = useWalletState(initialChainId);
  const { 
    wallet, tronPrivateKey, activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, view, setView, error, setError, notification, setNotification,
    tokenToEdit, setTokenToEdit, isChainModalOpen, setIsChainModalOpen, isAddTokenModalOpen, setIsAddTokenModalOpen,
    handleImport, privateKeyOrPhrase, setPrivateKeyOrPhrase, setWallet, isMenuOpen, setIsMenuOpen, isLoading, setIsLoading,
  } = state;

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

  const { fetchData, balance, tokenBalances, safeDetails } = dataLayer;

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
    wallet, activeSafeAddress, activeChainId, activeChain, provider, safeDetails,
    setPendingSafeTxs, setTrackedSafes, setActiveAccountType, setActiveSafeAddress,
    setView, setNotification, setError, syncNonce: txMgr.syncNonce,
    addTransactionRecord: txMgr.addTransactionRecord
  });

  useEffect(() => { 
    if (safeMgr && safeMgr.handleSafeProposal) {
      safeHandlerRef.current = safeMgr.handleSafeProposal; 
    }
  }, [safeMgr?.handleSafeProposal]);

  useEffect(() => {
    const isCoreView = view === 'intro_animation' || view === 'dashboard';
    if (wallet && isCoreView) {
      fetchData();
      if (activeChain.chainType !== 'TRON') txMgr.syncNonce();
    }
  }, [activeChainId, activeAccountType, activeSafeAddress, wallet, view, activeChain.chainType]);

  const handleSaveChain = (config: ChainConfig) => {
    setChains(prev => prev.map(c => c.id === config.id ? { ...config, isCustom: true } : c));
    setIsChainModalOpen(false);
    setNotification("Network node updated");
  };

  const handleTrackSafe = (address: string) => {
    const name = `Safe_${address.slice(2, 6)}`;
    setTrackedSafes(prev => [...prev, { address, name, chainId: activeChainId }]);
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

  const confirmAddToken = async (address: string) => {
    if (!provider || !address) return;
    if (!ethers.isAddress(address)) {
      setError("Invalid token address.");
      return;
    }
    const normalized = address.toLowerCase();
    if (activeChainTokens.some(t => t.address.toLowerCase() === normalized)) {
      setError("Token already exists on this network.");
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
      setNotification(`Imported ${symbol} successfully`);
    } catch (e) {
      setError("Failed to import token.");
    } finally { setIsLoading(false); }
  };

  const handleUpdateToken = (token: TokenConfig) => {
    setCustomTokens(prev => ({
      ...prev,
      [activeChainId]: (prev[activeChainId] || []).map(t => t.address === token.address ? token : t)
    }));
    setTokenToEdit(null);
    setNotification("Token updated");
  };

  const handleRemoveToken = (address: string) => {
    setCustomTokens(prev => ({
      ...prev,
      [activeChainId]: (prev[activeChainId] || []).filter(t => t.address !== address)
    }));
    setTokenToEdit(null);
    setNotification("Token removed");
  };

  return { 
    ...state, ...dataLayer, ...txMgr, ...safeMgr, ...storage,
    activeChain, activeAddress, activeChainTokens, provider,
    handleSaveChain, handleTrackSafe, handleSwitchNetwork, confirmAddToken, handleUpdateToken, handleRemoveToken,
    currentNonce: safeDetails?.nonce || 0
  };
};
