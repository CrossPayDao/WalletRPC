
import React, { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { SAFE_ABI, PROXY_FACTORY_ABI, ZERO_ADDRESS, SENTINEL_OWNERS, getSafeConfig } from '../config';
import { FeeService } from '../../../services/feeService';

/**
 * 【架构设计：多签中枢管理器】
 * 目的：封装 Gnosis Safe 的复杂交互逻辑（提议、签名、执行、部署）。
 * 背景：Safe 交易不是简单的 sendTransaction，而是一套基于 Hash 的离线签名流。
 * 协作：
 * 1. 产生 SafePendingTx 存入 Storage。
 * 2. 达到门槛后，通过 TransactionManager 广播。
 */
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
}: any) => {

  const [isDeployingSafe, setIsDeployingSafe] = useState(false);
  const isProposingRef = useRef(false);

  /**
   * 【核心逻辑：Safe 交易提议 (Proposing)】
   * 步骤：
   * 1. 链上获取当前的 Safe Nonce。
   * 2. 计算 getTransactionHash（这是 Safe 合约内部校验的唯一标识）。
   * 3. 离线签名 Hash。
   * 
   * 【技术细节：V + 4 修正】
   * 为什么：Safe 协议要求签名最后一位 V 值加 4（如果是 EIP-191 签名），以区分不同的签名类型。
   * 解决了什么：如果不加 4，Safe 合约校验时会报 GS026 错误（签名无效）。
   */
  const handleSafeProposal = async (to: string, value: bigint, data: string, summary?: string): Promise<boolean> => {
      if (!wallet || !activeSafeAddress || !provider) return false;
      
      if (isProposingRef.current) throw new Error("Busy...");
      isProposingRef.current = true;
      
      try {
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
        const [currentNonce, owners, threshold] = await Promise.all([
           safeContract.nonce().then(n => Number(n)),
           safeContract.getOwners(),
           safeContract.getThreshold().then(t => Number(t))
        ]);
        
        const isOwner = owners.some((o: string) => o.toLowerCase() === wallet.address.toLowerCase());
        if (!isOwner) throw new Error("Not an owner");
        
        const safeTxHash = await safeContract.getTransactionHash(
            to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, currentNonce
        );

        const flatSig = await wallet.signMessage(ethers.getBytes(safeTxHash));
        const sig = ethers.Signature.from(flatSig);
        
        // 关键：Safe 协议兼容性修正
        let v = sig.v; if (v < 30) v += 4;
        const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

        /**
         * 【执行策略分支】
         * - 如果门槛为 1：直接上链执行（Exec），跳过队列。
         * - 如果门槛 > 1：存入本地队列（Proposal），等待其他所有者签名。
         */
        if (threshold === 1) {
           const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
           const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 500000);
           const safeWrite = safeContract.connect(wallet.connect(provider));

           const tx = await (safeWrite as any).execTransaction(
              to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, adjustedSig, overrides
           );
           
           addTransactionRecord({ 
             id: Date.now().toString(), hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: summary || "Safe Exec"
           });
           return true;
        } else {
           setPendingSafeTxs((prev: any) => [...prev, {
              id: Date.now().toString(), to, value: value.toString(), data, nonce: currentNonce, safeTxHash, signatures: { [wallet.address]: adjustedSig }, summary: summary || "Proposal"
           }]);
           setView('safe_queue');
           return true;
        }
      } finally {
        isProposingRef.current = false;
      }
  };

  /**
   * 【逻辑：签名归集与执行 (Execution)】
   * 优势：一旦本地收集齐了足够的签名（signatures 数量 >= threshold），任何账户都可以代付 Gas 发起执行。
   */
  const handleExecutePending = async (tx: any) => {
     if (!wallet || !activeSafeAddress || !provider) return;
     try {
        // 排序签名：Safe 要求签名必须按签名者地址从小到大排序，否则校验失败。
        const sortedSigners = Object.keys(tx.signatures).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        let packedSigs = "0x";
        for (const owner of sortedSigners) packedSigs += tx.signatures[owner].slice(2);
        
        const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, wallet.connect(provider));
        const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 800000);
        
        const execTx = await (safeContract as any).execTransaction(tx.to, BigInt(tx.value), tx.data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, packedSigs, overrides);
        
        addTransactionRecord({ 
          id: Date.now().toString(), hash: execTx.hash, status: 'submitted', timestamp: Date.now(), summary: tx.summary
        });
        setPendingSafeTxs((prev: any) => prev.filter((p: any) => p.id !== tx.id));
        syncNonce();
     } catch (e: any) { setError(e.message); }
  };

  return { isDeployingSafe, handleSafeProposal, handleAddSignature: async (tx: any) => { /* 签名逻辑 */ }, handleExecutePending, deploySafe: async () => { /* 部署逻辑 */ }, addOwnerTx: async () => { return false; }, removeOwnerTx: async () => { return false; }, changeThresholdTx: async () => { return false; } };
};
