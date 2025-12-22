
import { useEffect, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { useWalletStorage } from './useWalletStorage';
import { useWalletState } from './useWalletState';
import { useWalletData } from './useWalletData';
import { useTransactionManager } from './useTransactionManager';
import { useSafeManager } from './useSafeManager';
import { ChainConfig, TokenConfig } from '../types';

/**
 * 【中枢神经系统 Hook：Orchestrator Pattern】
 * 目的：协调 Storage, State, Data, TxManager 和 SafeManager。
 * 为什么：通过一个主 Hook 暴露所有接口，方便 UI 层直接调用，保持逻辑高度聚合。
 */
export const useEvmWallet = () => {
  // 1. 状态加载与持久化
  const storage = useWalletStorage();
  const { trackedSafes, setTrackedSafes, chains, setChains, customTokens, setCustomTokens, pendingSafeTxs, setPendingSafeTxs } = storage;
  
  const state = useWalletState(chains[0].id);
  const { 
    wallet, activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, view, setView, error, setError, notification, setNotification,
    tokenToEdit, setTokenToEdit, isChainModalOpen, setIsChainModalOpen, isAddTokenModalOpen, setIsAddTokenModalOpen,
    handleImport, privateKeyOrPhrase, setPrivateKeyOrPhrase, setWallet, isMenuOpen, setIsMenuOpen, isLoading, setIsLoading,
    errorObject
  } = state;

  // 2. 派生计算属性 (Memoized)
  const activeChain = useMemo(() => {
    return chains.find(c => c.id === activeChainId) || chains[0];
  }, [chains, activeChainId]);

  const activeAddress = useMemo(() => {
    if (!wallet) return null;
    if (activeAccountType === 'SAFE') return activeSafeAddress;
    return activeChain.chainType === 'TRON' ? state.tronWalletAddress : wallet.address;
  }, [wallet, activeAccountType, activeSafeAddress, activeChain, state.tronWalletAddress]);

  const activeChainTokens = useMemo(() => {
    const defaultTokens = activeChain.tokens || [];
    const userTokens = customTokens[activeChainId] || [];
    return [...defaultTokens, ...userTokens];
  }, [activeChain, customTokens, activeChainId]);

  const provider = useMemo(() => {
    if (activeChain.chainType === 'TRON') return null;
    return new ethers.JsonRpcProvider(activeChain.defaultRpcUrl);
  }, [activeChain]);

  // 3. 数据层挂载
  const dataLayer = useWalletData({
    wallet,
    activeAddress,
    activeChain,
    activeAccountType,
    activeChainTokens,
    provider,
    setIsLoading,
    setError
  });

  const { fetchData, balance, tokenBalances, safeDetails, isInitialFetchDone } = dataLayer;

  // 4. 解决循环依赖：Ref Tunneling (引用隧道)
  const safeHandlerRef = useRef<any>(null);
  const txMgr = useTransactionManager({
    wallet,
    provider,
    activeChain,
    activeChainId,
    fetchData,
    setError,
    handleSafeProposal: async (t: string, v: bigint, d: string, s: string) => { 
        if (safeHandlerRef.current) return await safeHandlerRef.current(t, v, d, s); 
        return false;
    }
  });

  const { transactions, syncNonce, handleSendSubmit } = txMgr;

  const safeMgr = useSafeManager({
    wallet,
    activeSafeAddress,
    activeChainId,
    activeChain,
    provider,
    safeDetails,
    setPendingSafeTxs,
    setTrackedSafes,
    setActiveAccountType,
    setActiveSafeAddress,
    setView,
    setNotification,
    setError,
    syncNonce: txMgr.syncNonce,
    addTransactionRecord: txMgr.addTransactionRecord
  });

  useEffect(() => { 
    safeHandlerRef.current = safeMgr.handleSafeProposal; 
  }, [safeMgr.handleSafeProposal]);

  /**
   * 【性能关键：视图白名单同步策略 (View Whitelisting)】
   */
  useEffect(() => {
    const isCoreView = view === 'intro_animation' || view === 'dashboard';
    
    if (wallet && isCoreView) {
      fetchData();
      if (activeChain.chainType !== 'TRON') {
        txMgr.syncNonce();
      }
    }
  }, [activeChainId, activeAccountType, activeSafeAddress, wallet, view, activeChain.chainType, fetchData]);

  // App Level Modal Handlers
  const confirmAddToken = async (address: string) => {
    // Simulated token import logic
    setIsAddTokenModalOpen(false);
    setNotification("Token imported successfully");
  };

  const handleUpdateToken = (token: TokenConfig) => {
    setCustomTokens(prev => {
        const chainTokens = prev[activeChainId] || [];
        const updated = chainTokens.map(t => t.address === token.address ? token : t);
        return { ...prev, [activeChainId]: updated };
    });
    setNotification("Token updated");
    setTokenToEdit(null);
  };

  const handleRemoveToken = (address: string) => {
    setCustomTokens(prev => {
        const chainTokens = prev[activeChainId] || [];
        const updated = chainTokens.filter(t => t.address !== address);
        return { ...prev, [activeChainId]: updated };
    });
    setNotification("Token removed");
    setTokenToEdit(null);
  };

  const handleSaveChain = (config: ChainConfig) => {
    setChains(prev => prev.map(c => c.id === config.id ? { ...config, isCustom: true } : c));
    setIsChainModalOpen(false);
    setNotification("Network settings saved");
  };

  const handleTrackSafe = (address: string) => {
    setTrackedSafes(prev => [...prev, { address, name: `Safe ${address.slice(0, 6)}`, chainId: activeChainId }]);
    setActiveSafeAddress(address);
    setActiveAccountType('SAFE');
    setView('dashboard');
  };

  return { 
    ...state, 
    ...dataLayer, 
    ...txMgr, 
    ...safeMgr, 
    ...storage,
    activeChain,
    activeAddress,
    activeChainTokens,
    provider,
    confirmAddToken,
    handleUpdateToken,
    handleRemoveToken,
    handleSaveChain,
    handleTrackSafe,
    currentNonce: safeDetails?.nonce || 0
  };
};
