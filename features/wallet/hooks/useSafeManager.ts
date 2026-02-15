
import React, { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { SAFE_ABI, PROXY_FACTORY_ABI, ZERO_ADDRESS, SENTINEL_OWNERS, getSafeConfig, ERC20_ABI } from '../config';
import { FeeService } from '../../../services/feeService';
import { ChainConfig, SafeDetails, SafePendingTx, TrackedSafe, TransactionRecord } from '../types';
import { useTranslation } from '../../../contexts/LanguageContext';

/**
 * 【多签中枢管理器 - RPC 优化增强版】
 */
interface UseSafeManagerParams {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  activeSafeAddress: string | null;
  activeChainId: number;
  activeChain: ChainConfig;
  provider: ethers.JsonRpcProvider | null;
  safeDetails: SafeDetails | null;
  setPendingSafeTxs: React.Dispatch<React.SetStateAction<SafePendingTx[]>>;
  setTrackedSafes: React.Dispatch<React.SetStateAction<TrackedSafe[]>>;
  setActiveAccountType: (accountType: 'EOA' | 'SAFE') => void;
  setActiveSafeAddress: (address: string | null) => void;
  setView: (view: string) => void;
  setNotification: (message: string | null) => void;
  setError: (message: string | null) => void;
  syncNonce: () => void | Promise<void>;
  addTransactionRecord: (record: TransactionRecord) => void;
}

export const useSafeManager = ({
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
  syncNonce,
  addTransactionRecord
}: UseSafeManagerParams) => {
  const { t } = useTranslation();

  const [isDeployingSafe, setIsDeployingSafe] = useState(false);
  const isProposingRef = useRef(false);

  /**
   * 【RPC 优化：Safe 提议 (Proposal)】
   * 
   * 意图：将 3 个独立的链上查询合并。
   * 如何减少 RPC：
   * 1. 移除了 getCode 检查，因为 fetchData 已验证合约存在。
   * 2. 利用 Promise.all 同步执行 Nonce、Owners、Threshold 查询。
   * 3. 在支持 HTTP Batch 的 RPC 节点上，这只会产生 1 个 HTTP 请求。
   * 4. 签名过程完全在本地 CPU 完成，无 RPC 开销。
   */
  const handleSafeProposal = async (to: string, value: bigint, data: string, summary?: string): Promise<boolean> => {
      if (!wallet || !activeSafeAddress || !provider) return false;
      
      if (isProposingRef.current) throw new Error(t('safe.err_busy'));
      isProposingRef.current = true;
      
      try {
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
        
        // [RPC 原子化合并]
        const [currentNonce, owners, threshold] = await Promise.all([
           safeContract.nonce().then(n => Number(n)),
           safeContract.getOwners(),
           safeContract.getThreshold().then(t => Number(t))
        ]);
        
        const isOwner = owners.some((o: string) => o.toLowerCase() === wallet.address.toLowerCase());
        if (!isOwner) throw new Error(t('safe.err_not_owner'));
        
        // [本地计算] 不占用网络
        const safeTxHash = await safeContract.getTransactionHash(
            to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, currentNonce
        );

        // [本地签名] 不占用网络
        const flatSig = await wallet.signMessage(ethers.getBytes(safeTxHash));
        const sig = ethers.Signature.from(flatSig);
        
        let v = sig.v; if (v < 30) v += 4;
        const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

        // --- 逻辑：Flash Execution (1/n 闪电执行) ---
        // 如果是单人多签，提议即执行，复用已获取的 Gas 缓存，仅 1 次广播请求。
        if (threshold === 1) {
           const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
           const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 500000);
           const safeWrite = safeContract.connect(wallet.connect(provider));

           const tx = await (safeWrite as any).execTransaction(
              to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, adjustedSig, overrides
           );
           
           addTransactionRecord({ id: Date.now().toString(), chainId: activeChainId, hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: summary || t('safe.summary_safe_exec') });
           return true;
        } else {
           // 否则仅作为提议存入内存，0 RPC。
           setPendingSafeTxs((prev: SafePendingTx[]) => [...prev, {
              id: Date.now().toString(),
              chainId: Number(activeChainId),
              safeAddress: activeSafeAddress,
              to,
              value: value.toString(),
              data,
              nonce: currentNonce,
              safeTxHash,
              signatures: { [wallet.address]: adjustedSig },
              summary: summary || t('safe.summary_proposal')
           }]);
           setView('safe_queue');
           return true;
        }
      } catch (e: any) {
        setError(e.message || t('safe.err_proposal_failed'));
        return false;
      } finally {
        isProposingRef.current = false;
      }
  };

  /**
   * 【RPC 优化：预测性部署 (Predictive Deployment)】
   * 
   * 如何减少 RPC：
   * 1. 使用 staticCall 提前预测 Safe 地址。
   * 2. 避免了部署后必须轮询 getCode 的等待过程。
   * 3. UI 可以在交易广播瞬间即确定“即将生成”的地址，极大提升用户体验。
   */
  const deploySafe = async (owners: string[], threshold: number) => {
    if (!wallet || !provider) return;
    setIsDeployingSafe(true);
    try {
      const config = getSafeConfig(activeChain);
      const factory = new ethers.Contract(config.proxyFactory, PROXY_FACTORY_ABI, wallet.connect(provider));
      const safeIface = new ethers.Interface(SAFE_ABI);
      
      const initializer = safeIface.encodeFunctionData("setup", [
        owners, threshold, ZERO_ADDRESS, "0x", config.fallbackHandler, ZERO_ADDRESS, 0, ZERO_ADDRESS
      ]);

      const saltNonce = Date.now();
      
      // [关键：staticCall 预测]
      let predictedAddress = await (factory as any).createProxyWithNonce.staticCall(config.singleton, initializer, saltNonce);

      const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
      const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeSetup || 2000000);

      const tx = await factory.createProxyWithNonce(config.singleton, initializer, saltNonce, overrides);
      addTransactionRecord({ id: Date.now().toString(), chainId: activeChainId, hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: t('safe.summary_deploy_safe') });
      setNotification(t('safe.notice_safe_deploy_submitted'));

      if (predictedAddress) {
        tx.wait()
          .then(() => {
            setTrackedSafes((prev: any) => {
              const exists = prev.some((s: any) => s.address.toLowerCase() === predictedAddress.toLowerCase() && s.chainId === activeChainId);
              if (exists) return prev;
              return [...prev, { address: predictedAddress, name: `Safe_${predictedAddress.slice(2, 6)}`, chainId: activeChainId }];
            });
            setActiveSafeAddress(predictedAddress);
            setActiveAccountType('SAFE');
            setView('dashboard');
            setNotification(t('safe.notice_safe_deployed_success'));
          })
          .catch((err: any) => {
            setError(err?.message || t('safe.err_safe_deploy_failed_after_submit'));
          });
      }
    } catch (e: any) {
      setError(e.message || t('safe.err_deployment_failed'));
    } finally {
      setIsDeployingSafe(false);
    }
  };

  /**
   * 管理成员变更：通过编码 Function Data 转化为标准的 Proposal，复用多签路径。
   */
  const addOwnerTx = async (owner: string, threshold: number) => {
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI);
    const data = safeContract.interface.encodeFunctionData("addOwnerWithThreshold", [owner, threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `${t('safe.summary_add_owner')}: ${owner.slice(0,6)}`);
  };

  // Fix: Added implementation for handleAddSignature
  const handleAddSignature = async (tx: SafePendingTx) => {
    if (!wallet) return;
    try {
      const ownersLower = (safeDetails?.owners || []).map((o: string) => o.toLowerCase());
      if (ownersLower.length > 0 && !ownersLower.includes(wallet.address.toLowerCase())) {
        throw new Error(t('safe.err_current_wallet_not_owner'));
      }
      const flatSig = await wallet.signMessage(ethers.getBytes(tx.safeTxHash));
      const sig = ethers.Signature.from(flatSig);
      let v = sig.v; if (v < 30) v += 4;
      const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);
      
      setPendingSafeTxs((prev: SafePendingTx[]) => prev.map(p => 
        p.id === tx.id ? { ...p, signatures: { ...p.signatures, [wallet.address]: adjustedSig } } : p
      ));
      setNotification(t('safe.notice_signature_added'));
    } catch (e: any) {
      setError(e.message || t('safe.err_signing_failed'));
    }
  };

  // Fix: Added implementation for handleExecutePending
  const handleExecutePending = async (tx: SafePendingTx) => {
    if (!wallet || !provider || !activeSafeAddress) return;
    try {
      const ownersLower = (safeDetails?.owners || []).map((o: string) => o.toLowerCase());
      // Sort signatures by owner address as required by Safe
      const sortedOwners = Object.keys(tx.signatures)
        .filter(owner => ownersLower.length === 0 || ownersLower.includes(owner.toLowerCase()))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const requiredThreshold = safeDetails?.threshold || 1;
      if (sortedOwners.length < requiredThreshold) {
        throw new Error(t('safe.err_not_enough_signatures'));
      }
      const signatures = ethers.concat(sortedOwners.map(owner => tx.signatures[owner]));

      const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, wallet.connect(provider));
      const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
      const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 500000);

      const response = await (safeContract as any).execTransaction(
        tx.to, tx.value, tx.data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, signatures, overrides
      );

      addTransactionRecord({
        id: Date.now().toString(),
        chainId: activeChainId,
        hash: response.hash,
        status: 'submitted',
        timestamp: Date.now(),
        summary: tx.summary
      });

      // Clear from queue after successful broadcast
      setPendingSafeTxs((prev: SafePendingTx[]) => prev.filter(p => p.id !== tx.id));
      setNotification(t('safe.notice_execution_broadcasted'));
    } catch (e: any) {
      setError(e.message || t('safe.err_execution_failed'));
    }
  };

  // Fix: Added implementation for removeOwnerTx
  const removeOwnerTx = async (owner: string, threshold: number) => {
    if (!activeSafeAddress || !provider) return false;
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
    const owners = await safeContract.getOwners();
    const index = owners.findIndex((o: string) => o.toLowerCase() === owner.toLowerCase());
    if (index === -1) throw new Error(t('safe.err_owner_not_found'));
    const prevOwner = index === 0 ? SENTINEL_OWNERS : owners[index - 1];

    const data = safeContract.interface.encodeFunctionData("removeOwner", [prevOwner, owner, threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `${t('safe.summary_remove_owner')}: ${owner.slice(0, 6)}`);
  };

  // Fix: Added implementation for changeThresholdTx
  const changeThresholdTx = async (threshold: number) => {
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI);
    const data = safeContract.interface.encodeFunctionData("changeThreshold", [threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `${t('safe.summary_change_threshold')}: ${threshold}`);
  };

  return { 
    isDeployingSafe, handleSafeProposal, deploySafe, handleAddSignature, handleExecutePending,
    addOwnerTx, removeOwnerTx, changeThresholdTx
  };
};
