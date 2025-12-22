
import { useState, useRef, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { TransactionRecord, ChainConfig } from '../types';
import { FeeService } from '../../../services/feeService';
import { handleTxError } from '../utils';

// Exported for SendForm
export interface ProcessResult {
  success: boolean;
  hash?: string;
  error?: string;
  isTimeout?: boolean;
}

/**
 * 【交易生命周期管理器】
 * 目的：处理 Nonce 连续性、费用预估、交易广播以及收据轮询。
 */
export const useTransactionManager = ({
  wallet,
  provider,
  activeChain,
  activeChainId,
  fetchData,
  setError,
  handleSafeProposal
}: any) => {

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  /**
   * 【核心优化：本地 Nonce 追踪 (Local Nonce Tracking)】
   * 为什么：在高频发笔交易时，链上的 nonce 更新有延迟。
   * 解决：在内存中维护 localNonceRef。发送一笔就自增，直到下一次 syncNonce 强制对齐。
   * 好处：解决了“交易覆盖”和“nonce冲突”报错问题。
   */
  const localNonceRef = useRef<number | null>(null);

  /**
   * 同步 Nonce
   */
  const syncNonce = useCallback(async () => {
    if (!wallet || !provider || activeChain.chainType === 'TRON') return;
    try {
      const n = await provider.getTransactionCount(wallet.address);
      localNonceRef.current = n;
    } catch (e) {
      console.error("Nonce sync failed", e);
    }
  }, [wallet, provider, activeChain]);

  /**
   * 【逻辑：收据轮询器 (Receipt Polling)】
   * 目的：自动将 'submitted' 状态的交易更新为 'confirmed' 或 'failed'。
   * 协作：一旦确认，调用外部传入的 fetchData() 刷新全局余额。
   */
  useEffect(() => {
    if (!provider || transactions.length === 0) return;
    
    const interval = setInterval(async () => {
      const pending = transactions.filter(t => t.status === 'submitted');
      if (pending.length === 0) return;

      for (const tx of pending) {
        if (!tx.hash) continue;
        try {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt) {
            setTransactions(prev => prev.map(t => 
              t.id === tx.id ? { ...t, status: receipt.status === 1 ? 'confirmed' : 'failed' } : t
            ));
            if (receipt.status === 1) fetchData();
          }
        } catch (e) {
          console.error("Receipt check failed", e);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [provider, transactions, activeChain, fetchData]);

  /**
   * 【逻辑：交易处理管道 (Transaction Pipeline)】
   */
  const handleSendSubmit = async (data: any): Promise<ProcessResult> => {
    try {
      if (!wallet || !provider) throw new Error("Wallet/Provider not ready");

      // Handle Safe Proposal if in SAFE mode
      if (data.activeAccountType === 'SAFE') {
        if (!handleSafeProposal) throw new Error("Safe manager not initialized");
        const amountWei = ethers.parseEther(data.amount || "0");
        const success = await handleSafeProposal(data.recipient, amountWei, data.customData || "0x", `Send ${data.amount} ${data.asset}`);
        return { success };
      }

      // EOA Send
      const amountWei = ethers.parseEther(data.amount || "0");
      const txRequest: ethers.TransactionRequest = {
        to: data.recipient,
        value: amountWei,
        data: data.customData || "0x"
      };

      const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
      const overrides = FeeService.buildOverrides(feeData);
      
      if (localNonceRef.current !== null) {
        overrides.nonce = localNonceRef.current;
      }

      const connectedWallet = wallet.connect(provider);
      const tx = await connectedWallet.sendTransaction({ ...txRequest, ...overrides });
      
      if (localNonceRef.current !== null) localNonceRef.current++;

      const id = Date.now().toString();
      setTransactions(prev => [{
        id,
        chainId: activeChainId,
        hash: tx.hash,
        status: 'submitted',
        timestamp: Date.now(),
        summary: `Send ${data.amount} ${activeChain.currencySymbol}`
      }, ...prev]);

      return { success: true, hash: tx.hash };
    } catch (e: any) {
      const error = handleTxError(e);
      setError(error);
      return { success: false, error };
    }
  };

  /**
   * 添加交易记录
   */
  const addTransactionRecord = (record: TransactionRecord) => {
    setTransactions(prev => [record, ...prev]);
  };

  return { transactions, localNonceRef, handleSendSubmit, syncNonce, addTransactionRecord };
};
