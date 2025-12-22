
import { useState, useRef, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { TransactionRecord, ChainConfig, TokenConfig } from '../types';
import { FeeService } from '../../../services/feeService';
import { handleTxError, normalizeHex } from '../utils';
import { TronService } from '../../../services/tronService';

export interface ProcessResult {
  success: boolean;
  hash?: string;
  error?: string;
  isTimeout?: boolean;
}

/**
 * 【交易生命周期管理器】
 */
export const useTransactionManager = ({
  wallet,
  tronPrivateKey,
  provider,
  activeChain,
  activeChainId,
  fetchData,
  setError,
  handleSafeProposal
}: any) => {

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const localNonceRef = useRef<number | null>(null);

  const syncNonce = useCallback(async () => {
    if (!wallet || !provider || activeChain.chainType === 'TRON') return;
    try {
      const n = await provider.getTransactionCount(wallet.address, 'pending');
      localNonceRef.current = n;
    } catch (e) {
      console.error("Nonce sync failed", e);
    }
  }, [wallet, provider, activeChain]);

  useEffect(() => {
    // 逻辑：如果是 TRON 网络，跳过基于 EVM Provider 的回执轮询。
    if (activeChain.chainType === 'TRON' || !provider || transactions.length === 0) return;
    
    const interval = setInterval(async () => {
      // 核心修复 1：使用显式的数值转换进行链 ID 过滤，防止 string/number 类型不匹配。
      const currentId = Number(activeChainId);
      const pending = transactions.filter(t => 
        t.status === 'submitted' && 
        Number(t.chainId) === currentId &&
        t.hash
      );
      
      if (pending.length === 0) return;

      for (const tx of pending) {
        if (!tx.hash) continue;
        
        try {
          // 核心修复 2：使用 normalizeHex 确保哈希严格符合 0x + 64位十六进制规范。
          const normalizedHash = normalizeHex(tx.hash);
          
          const receipt = await provider.getTransactionReceipt(normalizedHash);
          if (receipt) {
            setTransactions(prev => prev.map(t => 
              t.id === tx.id ? { ...t, status: receipt.status === 1 ? 'confirmed' : 'failed' } : t
            ));
            // 延迟刷新数据，确保索引节点已同步
            if (receipt.status === 1) setTimeout(fetchData, 1000);
          }
        } catch (e) {
          // 针对特定的 RPC 错误进行静默处理，避免干扰用户控制台
          const errStr = String(e);
          if (!errStr.includes("json: cannot unmarshal")) {
            console.error("Receipt check failed", e);
          }
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [provider, transactions, activeChain, activeChainId, fetchData]);

  const handleSendSubmit = async (data: any): Promise<ProcessResult> => {
    try {
      const isTron = activeChain.chainType === 'TRON';
      
      if (!wallet || (!provider && !isTron)) {
        throw new Error("Wallet/Provider not ready");
      }

      const displaySymbol = data.asset === 'NATIVE' ? activeChain.currencySymbol : data.asset;

      if (data.activeAccountType === 'SAFE') {
        if (!handleSafeProposal) throw new Error("Safe manager not initialized");
        const amountWei = ethers.parseUnits(data.amount || "0", data.asset === 'NATIVE' ? 18 : 6); 
        const success = await handleSafeProposal(data.recipient, amountWei, data.customData || "0x", `Send ${data.amount} ${displaySymbol}`);
        return { success };
      }

      // TRON 发送逻辑
      if (isTron) {
        if (!tronPrivateKey) throw new Error("TRON private key missing");
        
        const token = activeChain.tokens.find((t: TokenConfig) => t.symbol === data.asset);
        const decimals = data.asset === 'NATIVE' ? 6 : (token?.decimals || 6);
        const amountSun = ethers.parseUnits(data.amount || "0", decimals);

        const result = await TronService.sendTransaction(
          activeChain.defaultRpcUrl,
          tronPrivateKey,
          data.recipient,
          amountSun,
          data.asset === 'NATIVE' ? undefined : token?.address
        );

        if (result.success && result.txid) {
          const id = Date.now().toString();
          setTransactions(prev => [{
            id,
            chainId: Number(activeChainId),
            hash: result.txid,
            status: 'submitted',
            timestamp: Date.now(),
            summary: `Send ${data.amount} ${displaySymbol}`
          }, ...prev]);
          
          setTimeout(fetchData, 3000);
          return { success: true, hash: result.txid };
        } else {
          throw new Error(result.error || "TRON broadcast failed");
        }
      }

      // EVM 发送逻辑
      if (localNonceRef.current === null) {
        await syncNonce();
      }

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
        chainId: Number(activeChainId),
        hash: tx.hash,
        status: 'submitted',
        timestamp: Date.now(),
        summary: `Send ${data.amount} ${displaySymbol}`
      }, ...prev]);

      return { success: true, hash: tx.hash };
    } catch (e: any) {
      const errorMsg = e?.message || "";
      if (errorMsg.includes("nonce") || errorMsg.includes("replacement transaction")) {
        localNonceRef.current = null;
      }
      const error = handleTxError(e);
      setError(error);
      return { success: false, error };
    }
  };

  return { transactions, localNonceRef, handleSendSubmit, syncNonce, addTransactionRecord: (r: any) => setTransactions(p => [r, ...p]) };
};
