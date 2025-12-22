
import { useState, useRef, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { TransactionRecord, ChainConfig, TokenConfig } from '../types';
import { FeeService } from '../../../services/feeService';
import { handleTxError } from '../utils';
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
    if (activeChain.chainType === 'TRON' || !provider || transactions.length === 0) return;
    
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

  const handleSendSubmit = async (data: any): Promise<ProcessResult> => {
    try {
      const isTron = activeChain.chainType === 'TRON';
      
      if (!wallet || (!provider && !isTron)) {
        throw new Error("Wallet/Provider not ready");
      }

      if (data.activeAccountType === 'SAFE') {
        if (!handleSafeProposal) throw new Error("Safe manager not initialized");
        const amountWei = ethers.parseUnits(data.amount || "0", data.asset === 'NATIVE' ? 18 : 6); 
        const success = await handleSafeProposal(data.recipient, amountWei, data.customData || "0x", `Send ${data.amount} ${data.asset}`);
        return { success };
      }

      // TRON 发送逻辑
      if (isTron) {
        if (!tronPrivateKey) throw new Error("TRON private key missing");
        
        // 查找代币配置以获取精度
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
            chainId: activeChainId,
            hash: result.txid,
            status: 'submitted',
            timestamp: Date.now(),
            summary: `Send ${data.amount} ${data.asset === 'NATIVE' ? activeChain.currencySymbol : data.asset}`
          }, ...prev]);
          
          // TRON 广播后通常 3 秒左右生效，提前刷新
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
        chainId: activeChainId,
        hash: tx.hash,
        status: 'submitted',
        timestamp: Date.now(),
        summary: `Send ${data.amount} ${activeChain.currencySymbol}`
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
