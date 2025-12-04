
import { useEffect, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../config';
import { TokenConfig, ChainConfig } from '../types';
import { useWalletStorage } from './useWalletStorage';
import { useWalletState } from './useWalletState';
import { useWalletData } from './useWalletData';
import { useTransactionManager } from './useTransactionManager';
import { useSafeManager } from './useSafeManager';

/**
 * Hook: useEvmWallet
 * 
 * 作用:
 * Nexus Vault (Wallet) 的主控制器。
 * 此文件已被重构为组合层，逻辑被拆分至子 Hook 中：
 * - useWalletState: UI 状态
 * - useWalletData: 数据获取
 * - useTransactionManager: 交易处理
 * - useSafeManager: Safe 管理
 */
export const useEvmWallet = () => {
  
  // 1. 持久化存储
  const {
    trackedSafes,
    setTrackedSafes,
    chains,
    setChains,
    customTokens,
    setCustomTokens,
    pendingSafeTxs,
    setPendingSafeTxs
  } = useWalletStorage();

  // 2. 基础 UI 和钱包状态
  const state = useWalletState(chains[0].id);
  const { 
    wallet, activeAccountType, activeSafeAddress, activeChainId, 
    view, setView, setError, setNotification, setIsLoading, tronWalletAddress, tronPrivateKey
  } = state;

  // 计算属性
  const activeChain = useMemo(() => chains.find(c => c.id === activeChainId) || chains[0], [activeChainId, chains]);
  
  const activeChainTokens = useMemo(() => {
    return [...activeChain.tokens, ...(customTokens[activeChainId] || [])];
  }, [activeChain, customTokens, activeChainId]);

  const provider = useMemo(() => {
    if (activeChain.chainType === 'TRON') return null;
    const network = new ethers.Network(activeChain.name, activeChain.id);
    return new ethers.JsonRpcProvider(activeChain.defaultRpcUrl, network, { staticNetwork: network });
  }, [activeChain]);

  const activeAddress = useMemo(() => {
    if (activeAccountType === 'SAFE') return activeSafeAddress;
    return activeChain.chainType === 'TRON' ? tronWalletAddress : wallet?.address;
  }, [activeAccountType, activeSafeAddress, wallet, tronWalletAddress, activeChain]);

  // 3. 数据层
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

  // 4. 交易与 Safe 管理 (使用 Ref 解决循环依赖: TxMgr <-> SafeMgr)
  const safeHandlerRef = useRef<(to: string, value: bigint, data: string, summary: string) => Promise<void>>(async () => {});
  
  const txMgr = useTransactionManager({
    wallet,
    tronPrivateKey, // Pass dedicated tron key
    activeAddress,
    activeChain,
    activeChainTokens,
    activeAccountType,
    provider,
    tokenBalances: dataLayer.tokenBalances,
    balance: dataLayer.balance,
    fetchData: dataLayer.fetchData,
    setNotification,
    setError,
    handleSafeProposal: async (t, v, d, s) => safeHandlerRef.current(t, v, d, s)
  });

  const safeMgr = useSafeManager({
    wallet,
    activeSafeAddress,
    activeChainId,
    activeChain,
    provider,
    safeDetails: dataLayer.safeDetails,
    setPendingSafeTxs,
    setTrackedSafes,
    setActiveAccountType: state.setActiveAccountType,
    setActiveSafeAddress: state.setActiveSafeAddress,
    setView,
    setNotification,
    setError,
    syncNonce: txMgr.syncNonce,
    addTransactionRecord: txMgr.addTransactionRecord
  });
  
  // 更新 Ref 指向真实的 Safe 处理函数
  useEffect(() => {
    safeHandlerRef.current = safeMgr.handleSafeProposal;
  }, [safeMgr.handleSafeProposal]);

  // 副作用处理
  useEffect(() => {
    if (activeChain.chainType === 'TRON' && activeAccountType === 'SAFE') {
      state.setActiveAccountType('EOA');
      setView('dashboard');
    }
  }, [activeChain, activeAccountType, state.setActiveAccountType, setView]);

  useEffect(() => {
    txMgr.localNonceRef.current = null;
  }, [activeChainId]);

  useEffect(() => {
    if (wallet && view !== 'onboarding') {
      dataLayer.fetchData();
      if (activeChain.chainType !== 'TRON') {
        txMgr.syncNonce();
      }
    }
  }, [activeChainId, activeAccountType, activeSafeAddress, wallet, view, activeChainTokens]);

  // Token 管理辅助函数
  const confirmAddToken = async (address: string) => {
     if (activeChain.chainType === 'TRON') {
         setError("当前版本暂不支持 Tron 自定义代币");
         return;
     }
     if (!ethers.isAddress(address)) { setError("地址格式无效"); return; }
     state.setIsAddingToken(true);
     setError(null);
     try {
        if (!provider) throw new Error("Provider 未初始化");
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        const [symbol, decimals, name] = await Promise.all([ contract.symbol(), contract.decimals(), contract.name() ]);
        const newToken: TokenConfig = { symbol, name, decimals: Number(decimals), address: address, isCustom: true };
        
        setCustomTokens(prev => ({ ...prev, [activeChainId]: [...(prev[activeChainId] || []), newToken] }));
        setNotification(`已添加 ${symbol}`);
        state.setIsAddTokenModalOpen(false); 
     } catch (e) { console.error(e); setError("在该网络上未找到此代币合约"); } finally { state.setIsAddingToken(false); }
  };

  const handleUpdateToken = (updated: TokenConfig) => { 
    setCustomTokens(prev => { 
        const list = [...(prev[activeChainId] || [])]; 
        const idx = list.findIndex(t => t.address === updated.address); 
        if (idx !== -1) { list[idx] = updated; return { ...prev, [activeChainId]: list }; } 
        return prev; 
    }); 
    state.setTokenToEdit(null); 
  };
  
  const handleRemoveToken = (address: string) => { 
    setCustomTokens(prev => ({ ...prev, [activeChainId]: (prev[activeChainId] || []).filter(t => t.address !== address) })); 
    state.setTokenToEdit(null); 
  };
  
  const handleSaveChain = (newConfig: ChainConfig) => {
     if (!newConfig.name || !newConfig.defaultRpcUrl || !newConfig.id) { setError("缺少必填字段"); return; }
     newConfig.isCustom = true;
     if (!newConfig.tokens) newConfig.tokens = [];
     setChains(prev => {
        const exists = prev.findIndex(c => c.id === newConfig.id);
        if (exists !== -1) { const copy = [...prev]; copy[exists] = { ...copy[exists], ...newConfig }; return copy; } 
        else { return [...prev, newConfig]; }
     });
     state.setIsChainModalOpen(false); state.setActiveChainId(newConfig.id);
  };

  return {
    ...state,
    ...dataLayer,
    ...txMgr,
    ...safeMgr,
    trackedSafes, setTrackedSafes,
    chains, 
    activeChain,
    activeChainTokens,
    activeAddress,
    tokenBalances: dataLayer.tokenBalances,
    confirmAddToken,
    handleUpdateToken,
    handleRemoveToken,
    handleSaveChain,
    pendingSafeTxs
  };
};
