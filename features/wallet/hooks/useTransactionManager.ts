

import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { handleTxError, normalizeHex } from '../utils';
import { TransactionRecord, ChainConfig, TokenConfig } from '../types';
import { SendFormData } from '../components/SendForm';
import { ERC20_ABI } from '../config';

interface UseTransactionManagerProps {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  activeAddress: string | null | undefined;
  activeChain: ChainConfig;
  activeChainTokens: TokenConfig[];
  activeAccountType: 'EOA' | 'SAFE';
  provider: ethers.JsonRpcProvider | null;
  tokenBalances: Record<string, string>;
  balance: string;
  fetchData: () => void;
  setNotification: (msg: string) => void;
  setError: (msg: string | null) => void;
  // Callback to delegate Safe proposal creation
  handleSafeProposal: (to: string, value: bigint, data: string, summary: string) => Promise<void>;
}

export type ProcessResult = {
    success: boolean;
    hash?: string;
    isTimeout?: boolean;
    error?: string;
};

/**
 * Hook: useTransactionManager
 * 
 * 作用:
 * 管理交易生命周期。
 * 1. 交易队列 (Queue)
 * 2. Nonce 管理 (乐观更新)
 * 3. 交易广播 (EVM/TRON)
 * 4. 发送表单提交逻辑 (路由到 EOA 直接发送或 Safe 提案)
 * 5. 后台轮询交易状态
 */
export const useTransactionManager = ({
  wallet,
  activeAddress,
  activeChain,
  activeChainTokens,
  activeAccountType,
  provider,
  tokenBalances,
  balance,
  fetchData,
  setNotification,
  setError,
  handleSafeProposal
}: UseTransactionManagerProps) => {

  /** 本地交易记录 (Session 级别) */
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  /** 
   * 本地 Nonce 追踪器
   * 用于在交易未上链前，乐观地增加本地 Nonce，允许连续发送多笔交易。
   */
  const localNonceRef = useRef<number | null>(null);
  const noncePromiseRef = useRef<Promise<number> | null>(null);

  /**
   * 背景轮询：检查状态为 'submitted' 的交易是否已确认
   */
  useEffect(() => {
    if (transactions.length === 0) return;

    // Filter relevant transactions (submitted and belonging to current chain)
    // Note: We also check activeChain.chainType inside the loop to dispatch logic
    const submittedTxs = transactions.filter(tx => tx.status === 'submitted' && tx.hash && tx.chainId === activeChain.id);
    if (submittedTxs.length === 0) return;

    const checkReceipts = async () => {
        let needsUpdate = false;
        const updatedList = [...transactions];

        for (const tx of submittedTxs) {
            try {
                // EVM Logic
                if (activeChain.chainType !== 'TRON' && tx.hash && provider) {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.status !== null) {
                        const index = updatedList.findIndex(t => t.id === tx.id);
                        if (index !== -1) {
                            updatedList[index] = {
                                ...updatedList[index],
                                status: receipt.status === 1 ? 'confirmed' : 'failed',
                                error: receipt.status === 0 ? 'Transaction Reverted' : undefined
                            };
                            needsUpdate = true;
                        }
                    }
                }
                // Tron Logic
                else if (activeChain.chainType === 'TRON' && tx.hash) {
                   const host = activeChain.defaultRpcUrl;
                   const info = await TronService.getTransactionInfo(host, tx.hash);
                   
                   // If info is empty object {}, it's still pending/not found in solidity node
                   if (info && info.id) {
                      const index = updatedList.findIndex(t => t.id === tx.id);
                      if (index !== -1) {
                         // Check receipt status
                         // Usually info.receipt.result == 'SUCCESS' or it might be 'OUT_OF_ENERGY', 'REVERT' etc.
                         let isSuccess = true;
                         let errorMsg = undefined;

                         if (info.receipt && info.receipt.result && info.receipt.result !== 'SUCCESS') {
                            isSuccess = false;
                            errorMsg = info.receipt.result;
                         }

                         updatedList[index] = {
                            ...updatedList[index],
                            status: isSuccess ? 'confirmed' : 'failed',
                            error: errorMsg
                         };
                         needsUpdate = true;
                      }
                   }
                }
            } catch (e) {
                console.warn(`Error checking receipt for ${tx.hash}`, e);
            }
        }

        if (needsUpdate) {
            setTransactions(updatedList);
            fetchData(); // Update balances
        }
    };

    const timer = setInterval(checkReceipts, 3000);
    return () => clearInterval(timer);
  }, [provider, transactions, activeChain]);


  /**
   * 同步 Nonce
   * 从链上获取最新计数，仅在无本地乐观 Nonce 时更新。
   */
  const syncNonce = async () => {
    if (!wallet || !activeAddress || !provider) return;
    try {
       if (localNonceRef.current === null) {
          const nonce = await provider.getTransactionCount(activeAddress);
          if (localNonceRef.current === null || localNonceRef.current < nonce) {
             localNonceRef.current = nonce;
          }
       }
    } catch (e) {
       console.warn("Nonce sync failed", e);
    }
  };

  /**
   * 交易入队
   */
  const queueTransaction = async (
     txRequest: any,
     summary: string, 
     id: string,
     isTron: boolean = false
  ): Promise<ProcessResult> => {
     setTransactions(prev => [{ 
        id, 
        chainId: activeChain.id,
        status: 'queued', 
        timestamp: Date.now(), 
        summary
     }, ...prev]);

     if (isTron) {
        return processTronTransaction(txRequest, id);
     } else {
        return processTransaction(txRequest, id);
     }
  };

  /** 处理 Tron 交易 */
  const processTronTransaction = async (txRequest: any, id: string): Promise<ProcessResult> => {
     try {
        if (!wallet) throw new Error("钱包未解锁");
        const host = activeChain.defaultRpcUrl;
        
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'submitted' } : t));

        let hash;
        const pk = wallet.privateKey.startsWith('0x') ? wallet.privateKey : '0x' + wallet.privateKey;

        // Tron broadcast is usually fast, but confirmation takes time. 
        // We consider broadcast success as 'timeout' (pending) for the UI if it's not instant.
        if (txRequest.type === 'NATIVE') {
            hash = await TronService.sendTrx(host, pk, txRequest.to, Number(txRequest.amount));
        } else if (txRequest.type === 'TOKEN') {
            hash = await TronService.sendTrc20(host, pk, txRequest.to, txRequest.amount, txRequest.contractAddress);
        }

        if (hash) {
            // Tron usually returns hash immediately after broadcast, but it's not "Confirmed" in a block yet.
            // We mark it as 'submitted' and return timeout=true so UI shows "Waiting for confirmation".
            setTransactions(prev => prev.map(t => t.id === id ? { ...t, hash: hash, status: 'submitted' } : t));
            return { success: true, hash, isTimeout: true }; 
        } else {
            throw new Error("Tron 交易失败或被拒绝");
        }

     } catch (e: any) {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'failed', error: e.message || "失败" } : t));
        return { success: false, error: e.message };
     }
  };

  /** 处理 EVM 交易 (带 5秒 Race Condition) */
  const processTransaction = async (txRequest: ethers.TransactionRequest, id: string): Promise<ProcessResult> => {
     if (!wallet || !provider) return { success: false, error: "Provider invalid" };
     try {
        const connectedWallet = wallet.connect(provider);
        let nonceToUse: number;

        // Nonce 逻辑
        if (txRequest.nonce !== undefined && txRequest.nonce !== null) {
            nonceToUse = Number(txRequest.nonce);
            localNonceRef.current = null;
        } else {
            if (localNonceRef.current !== null) {
                nonceToUse = localNonceRef.current;
                localNonceRef.current++;
            } else {
                if (!noncePromiseRef.current) {
                    noncePromiseRef.current = provider.getTransactionCount(wallet.address);
                }
                const fetchedNonce = await noncePromiseRef.current;
                if (localNonceRef.current !== null) {
                    nonceToUse = localNonceRef.current;
                } else {
                    nonceToUse = fetchedNonce;
                }
                localNonceRef.current = nonceToUse + 1;
                noncePromiseRef.current = null;
            }
            txRequest.nonce = nonceToUse;
        }
        
        // 特殊链适配 (BTT Donau)
        if (activeChain.id === 1029) {
            txRequest.gasLimit = BigInt(2000000); 
            delete txRequest.maxFeePerGas;
            delete txRequest.maxPriorityFeePerGas;
            txRequest.type = 0;
            if (!txRequest.gasPrice) {
               const feeData = await provider.getFeeData();
               txRequest.gasPrice = feeData.gasPrice ? (feeData.gasPrice * 150n) / 100n : undefined;
            }
        } else {
            if (!txRequest.gasLimit && txRequest.data && (txRequest.data as string).length > 10) {
               txRequest.gasLimit = BigInt(200000); 
            }
        }

        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'submitted' } : t));
        
        // 1. 发送 (Broadcast)
        const txResponse = await connectedWallet.sendTransaction(txRequest);
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, hash: txResponse.hash } : t));
        
        // 2. Race Condition: Wait for receipt OR 5s Timeout (Updated)
        const waitPromise = txResponse.wait();
        const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), 5000));

        const result = await Promise.race([waitPromise, timeoutPromise]);

        if (result === 'TIMEOUT') {
             // 5秒内未入块，但在后台状态已经是 submitted
             setNotification(`交易已广播，等待入块: ${txResponse.hash.slice(0,6)}...`);
             return { success: true, hash: txResponse.hash, isTimeout: true };
        } else {
             // 5秒内入块成功
             setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'confirmed' } : t));
             setNotification(`交易已确认: ${txResponse.hash.slice(0,6)}...`);
             fetchData();
             return { success: true, hash: txResponse.hash, isTimeout: false };
        }

     } catch (e: any) {
        console.error(`Tx ${id} failed:`, e);
        const errMsg = handleTxError(e);
        
        if (errMsg.includes('already known')) {
           setTransactions(prev => prev.map(t => t.id === id ? { 
              ...t, status: 'submitted', error: '交易已在内存池中' 
           } : t));
           return { success: true, isTimeout: true, error: 'Already known' }; // Treat as submitted/pending
        }

        if (errMsg.includes('nonce') || errMsg.includes('replacement')) {
           localNonceRef.current = null;
        }
        
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'failed', error: errMsg } : t));
        return { success: false, error: errMsg };
     }
  };

  /**
   * 提交发送表单
   * 校验数据 -> 路由到直接发送或 Safe 提案
   */
  const handleSendSubmit = async (formData: SendFormData): Promise<ProcessResult> => {
    if (!wallet || !activeAddress) return { success: false, error: "Wallet not ready" };
    setError(null);

    const { recipient, amount, asset, customData, gasPrice, gasLimit, nonce } = formData;

    // 1. 地址校验
    if (activeChain.chainType === 'TRON') {
        try {
           const hex = TronService.toHexAddress(recipient);
           if (!hex || hex.length !== 44) throw new Error("地址无效");
        } catch(e) {
           return { success: false, error: "无效的 Tron 接收地址" };
        }
    } else {
        if (!ethers.isAddress(recipient)) {
            return { success: false, error: "无效的接收地址" };
        }
    }

    const safeAmount = amount || '0';
    if (isNaN(Number(safeAmount)) || Number(safeAmount) < 0) {
        return { success: false, error: "金额无效" };
    }

    // 2. Tron 路径
    if (activeChain.chainType === 'TRON') {
        try {
            const summary = `转账 ${safeAmount} ${asset}`;
            let txPayload: any = {};

            if (asset === 'NATIVE') {
                const amountSun = Math.floor(parseFloat(safeAmount) * 1_000_000);
                const currentSunStr = await TronService.getBalance(activeChain.defaultRpcUrl, activeAddress);
                if (Number(currentSunStr) < amountSun) {
                    return { success: false, error: "TRX 余额不足" };
                }
                txPayload = { type: 'NATIVE', to: recipient, amount: amountSun };
            } else {
                const token = activeChainTokens.find(t => t.symbol === asset);
                if (!token) throw new Error("未找到代币");
                
                const currentBalStr = await TronService.getTrc20Balance(activeChain.defaultRpcUrl, activeAddress, token.address);
                const decimals = token.decimals || 6;
                const amountInt = ethers.parseUnits(safeAmount, decimals).toString();
                
                if (BigInt(currentBalStr) < BigInt(amountInt)) {
                    return { success: false, error: `${asset} 余额不足` };
                }
                txPayload = { type: 'TOKEN', to: recipient, amount: amountInt, contractAddress: token.address };
            }

            const txId = Date.now().toString();
            return await queueTransaction(txPayload, summary, txId, true);
        } catch (e: any) {
            return { success: false, error: handleTxError(e) };
        }
    }

    // 3. EVM 余额校验
    if (asset === 'NATIVE') {
        const currentBal = ethers.parseEther(balance);
        const sendAmount = ethers.parseEther(safeAmount);
        if (currentBal < sendAmount) {
            return { success: false, error: `${activeChain.currencySymbol} 余额不足` };
        }
    } else {
        const token = activeChainTokens.find(t => t.symbol === asset);
        if (token) {
            const currentBalStr = tokenBalances[asset] || '0';
            const currentBal = ethers.parseUnits(currentBalStr, token.decimals);
            const sendAmount = ethers.parseUnits(safeAmount, token.decimals);
            if (currentBal < sendAmount) {
                return { success: false, error: `${asset} 余额不足` };
            }
        }
    }

    // 4. 构建交易
    try {
      let txRequest: ethers.TransactionRequest = {};
      let summary = '';
      let toAddr = recipient;
      let value = ethers.parseEther(safeAmount);
      let data = customData ? normalizeHex(customData) : '0x';
      let txGasLimit = gasLimit ? BigInt(gasLimit) : undefined;
      let txGasPrice = gasPrice ? ethers.parseUnits(gasPrice, 'gwei') : undefined;

      if (asset !== 'NATIVE') {
         const token = activeChainTokens.find(t => t.symbol === asset);
         if (!token) throw new Error("Token not found");
         toAddr = token.address;
         value = 0n;
         const erc20 = new ethers.Interface(ERC20_ABI);
         data = erc20.encodeFunctionData("transfer", [recipient, ethers.parseUnits(safeAmount, token.decimals)]);
      }

      summary = `转账 ${safeAmount} ${asset}`;

      if (activeAccountType === 'EOA') {
        txRequest = { 
            to: toAddr, 
            value, 
            data, 
            gasLimit: txGasLimit, 
            gasPrice: txGasPrice, 
            nonce: nonce 
        };
        const txId = Date.now().toString();
        return await queueTransaction(txRequest, summary, txId, false);
      } else {
        await handleSafeProposal(toAddr, value, data, summary);
        return { success: true, isTimeout: true, hash: "SAFE_PROPOSAL" }; // Mock result for Safe
      }
    } catch (e: any) {
      return { success: false, error: handleTxError(e) };
    }
  };

  // 暴露给外部以添加记录 (例如 Safe 执行成功时)
  const addTransactionRecord = (record: TransactionRecord) => {
    setTransactions(prev => [record, ...prev]);
  };

  return {
    transactions,
    localNonceRef,
    syncNonce,
    queueTransaction,
    handleSendSubmit,
    addTransactionRecord
  };
};
