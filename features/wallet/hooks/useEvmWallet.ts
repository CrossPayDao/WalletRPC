
import { useEffect, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../config';
import { TokenConfig, ChainConfig } from '../types';
import { useWalletStorage } from './useWalletStorage';
import { useWalletState } from './useWalletState';
import { useWalletData } from './useWalletData';
import { useTransactionManager } from './useTransactionManager';
import { useSafeManager } from './useSafeManager';
import { useTranslation } from '../../../contexts/LanguageContext';

/**
 * Hook: useEvmWallet
 */
export const useEvmWallet = () => {
  const { t } = useTranslation();
  
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
  const safeHandlerRef = useRef<(to: string, value: bigint, data: string, summary?: string) => Promise<boolean>>(async () => false);
  
  const txMgr = useTransactionManager({
    wallet,
    tronPrivateKey, 
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
    handleSafeProposal: async (t, v, d, s) => { await safeHandlerRef.current(t, v, d, s); }
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
  
  useEffect(() => {
    safeHandlerRef.current = safeMgr.handleSafeProposal;
  }, [safeMgr.handleSafeProposal]);

  // 优化：只有当核心上下文（链、账户类型、地址）变化时才重置 Safe 状态
  useEffect(() => {
    if (activeAccountType === 'SAFE') {
       const isSafeValidOnChain = trackedSafes.some(
          s => s.address === activeSafeAddress && s.chainId === activeChainId
       );
       const isTron = activeChain.chainType === 'TRON';

       if (!isSafeValidOnChain || isTron) {
          state.setActiveAccountType('EOA');
          state.setActiveSafeAddress(null);
          if (view === 'safe_queue' || view === 'settings') {
             setView('dashboard');
          }
          setNotification("已切换回个人钱包 (该 Safe 不在当前网络)");
       }
    }
  }, [activeChainId, activeChain, activeAccountType, activeSafeAddress, trackedSafes]);

  // 优化：切链时重置 Nonce 缓存，但不在此处发起新请求
  useEffect(() => {
    txMgr.localNonceRef.current = null;
  }, [activeChainId]);

  /**
   * 核心数据同步逻辑
   * 优化点：去除了 [view] 依赖。
   * 行为：仅在初始化、切换钱包、切换网络或代币列表变更时执行全量同步。
   * 在 Dashboard、Settings 间切换不再触发任何 RPC。
   */
  useEffect(() => {
    if (wallet && view !== 'onboarding') {
      dataLayer.fetchData();
      if (activeChain.chainType !== 'TRON') {
        txMgr.syncNonce();
      }
    }
    // 明确移除 view 依赖，实现导航零 RPC 开销
  }, [activeChainId, activeAccountType, activeSafeAddress, wallet, activeChainTokens]);

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
        
        const code = await provider.getCode(address);
        if (code === '0x' || code === '0x0') {
           throw new Error("NOT_A_CONTRACT");
        }

        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        const [symbol, decimals, name] = await Promise.all([ 
            contract.symbol().catch(() => "UNKNOWN"), 
            contract.decimals().catch(() => 18), 
            contract.name().catch(() => "Unknown Token") 
        ]);
        
        const newToken: TokenConfig = { symbol, name, decimals: Number(decimals), address: address, isCustom: true };
        
        setCustomTokens(prev => ({ ...prev, [activeChainId]: [...(prev[activeChainId] || []), newToken] }));
        setNotification(`已添加 ${symbol}`);
        state.setIsAddTokenModalOpen(false); 
     } catch (e: any) { 
        console.error(e); 
        if (e.message === "NOT_A_CONTRACT") {
            setError("无效地址：目标不是一个合约。");
        } else {
            setError("代币导入失败：无法识别此代币。"); 
        }
     } finally { state.setIsAddingToken(false); }
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

  const handleTrackSafe = async (address: string) => {
      const trimmed = address.trim();
      setError(null);

      if (!trimmed) {
          setError(t("safe.error_empty"));
          return;
      }
      if (!trimmed.startsWith('0x')) {
          setError(t("safe.error_prefix"));
          return;
      }
      if (trimmed.length !== 42) {
          setError(t("safe.error_length"));
          return;
      }
      if (!ethers.isAddress(trimmed)) {
          setError(t("safe.error_format"));
          return;
      }

      if (!provider) {
          setError("RPC connection failure. Please check your network settings.");
          return;
      }

      setIsLoading(true);
      try {
          const code = await provider.getCode(trimmed);
          if (code === '0x') {
              throw new Error("NOT_A_CONTRACT");
          }

          setTrackedSafes(prev => [...prev, { 
              address: trimmed, 
              name: `Safe ${trimmed.slice(0,4)}`, 
              chainId: activeChainId 
          }]);
          
          state.setActiveAccountType('SAFE');
          state.setActiveSafeAddress(trimmed);
          setView('dashboard');
          setNotification("Vault sync complete.");
      } catch (e: any) {
          console.error(e);
          if (e.message === "NOT_A_CONTRACT") {
              setError(t("safe.error_not_contract"));
          } else {
              setError("Network Verification Error: " + (e.reason || e.message));
          }
      } finally {
          setIsLoading(false);
      }
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
    handleTrackSafe,
    pendingSafeTxs
  };
};
