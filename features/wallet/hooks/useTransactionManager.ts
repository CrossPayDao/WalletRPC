
import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { FeeService } from '../../../services/feeService';
import { handleTxError, normalizeHex } from '../utils';
import { TransactionRecord, ChainConfig, TokenConfig } from '../types';
import { SendFormData } from '../components/SendForm';
import { ERC20_ABI } from '../config';

interface UseTransactionManagerProps {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  tronPrivateKey: string | null;
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
  handleSafeProposal: (to: string, value: bigint, data: string, summary: string) => Promise<void>;
}

export type ProcessResult = {
    success: boolean;
    hash?: string;
    isTimeout?: boolean;
    error?: string;
};

export const useTransactionManager = ({
  wallet,
  tronPrivateKey,
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

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const localNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (transactions.length === 0) return;
    const submittedTxs = transactions.filter(tx => tx.status === 'submitted' && tx.hash && tx.chainId === activeChain.id);
    if (submittedTxs.length === 0) return;

    const checkReceipts = async () => {
        let needsUpdate = false;
        const updatedList = [...transactions];
        for (const tx of submittedTxs) {
            try {
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
                } else if (activeChain.chainType === 'TRON' && tx.hash) {
                   const host = activeChain.defaultRpcUrl;
                   const info = await TronService.getTransactionInfo(host, tx.hash);
                   if (info && info.id) {
                      const index = updatedList.findIndex(t => t.id === tx.id);
                      if (index !== -1) {
                         let isSuccess = info.receipt?.result === 'SUCCESS';
                         updatedList[index] = {
                            ...updatedList[index],
                            status: isSuccess ? 'confirmed' : 'failed',
                            error: isSuccess ? undefined : info.receipt?.result
                         };
                         needsUpdate = true;
                      }
                   }
                }
            } catch (e) { console.warn(e); }
        }
        if (needsUpdate) { setTransactions(updatedList); fetchData(); }
    };
    const timer = setInterval(checkReceipts, 3000);
    return () => clearInterval(timer);
  }, [provider, transactions, activeChain]);

  const syncNonce = async () => {
    if (!wallet || !activeAddress || !provider) return;
    try {
       const nonce = await provider.getTransactionCount(activeAddress);
       if (localNonceRef.current === null || localNonceRef.current < nonce) {
          localNonceRef.current = nonce;
       }
    } catch (e) { console.warn(e); }
  };

  const processTransaction = async (txRequest: ethers.TransactionRequest, id: string): Promise<ProcessResult> => {
     if (!wallet || !provider) return { success: false, error: "Provider invalid" };
     try {
        const connectedWallet = wallet.connect(provider);
        
        // 1. Nonce
        if (txRequest.nonce === undefined || txRequest.nonce === null) {
            if (localNonceRef.current !== null) {
                txRequest.nonce = localNonceRef.current++;
            } else {
                const fetchedNonce = await provider.getTransactionCount(wallet.address);
                txRequest.nonce = fetchedNonce;
                localNonceRef.current = fetchedNonce + 1;
            }
        }

        // 2. Fees & Overrides (Shared logic)
        const feeData = await FeeService.getOptimizedFeeData(provider, activeChain.id);
        
        // 3. Estimate/Apply Gas Limit
        let gasLimit = txRequest.gasLimit;
        if (!gasLimit) {
            const isERC20 = txRequest.data && (txRequest.data as string).startsWith('0xa9059cbb');
            const isSafeExec = txRequest.data && (txRequest.data as string).startsWith('0x6a76128f');

            if (isSafeExec && activeChain.gasLimits?.safeExec) {
                gasLimit = BigInt(activeChain.gasLimits.safeExec);
            } else if (isERC20 && activeChain.gasLimits?.erc20Transfer) {
                gasLimit = BigInt(activeChain.gasLimits.erc20Transfer);
            } else if (!txRequest.data || txRequest.data === '0x') {
                gasLimit = BigInt(activeChain.gasLimits?.nativeTransfer || 100000);
            } else {
                try {
                    const estimated = await provider.estimateGas(txRequest);
                    gasLimit = (estimated * 150n) / 100n;
                } catch {
                    gasLimit = BigInt(800000);
                }
            }
        }

        const overrides = FeeService.buildOverrides(feeData, gasLimit);
        const finalTx = { ...txRequest, ...overrides };

        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'submitted' } : t));
        const txResponse = await connectedWallet.sendTransaction(finalTx);
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, hash: txResponse.hash } : t));
        
        const result = await Promise.race([
            txResponse.wait(),
            new Promise<'TIMEOUT'>(r => setTimeout(() => r('TIMEOUT'), 6000))
        ]);

        if (result === 'TIMEOUT') {
             setNotification(`交易已广播: ${txResponse.hash.slice(0,8)}...`);
             return { success: true, hash: txResponse.hash, isTimeout: true };
        } else {
             setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'confirmed' } : t));
             fetchData();
             return { success: true, hash: txResponse.hash, isTimeout: false };
        }
     } catch (e: any) {
        const errMsg = handleTxError(e);
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'failed', error: errMsg } : t));
        localNonceRef.current = null;
        return { success: false, error: errMsg };
     }
  };

  const handleSendSubmit = async (formData: SendFormData): Promise<ProcessResult> => {
    if (!wallet || !activeAddress) return { success: false, error: "Wallet not ready" };
    setError(null);
    const { recipient, amount, asset, customData, gasPrice, gasLimit, nonce, bypassBalanceCheck = false } = formData;
    const safeAmount = amount || '0';
    const txId = Date.now().toString();

    if (activeChain.chainType === 'TRON') {
        const pk = tronPrivateKey || wallet.privateKey;
        const host = activeChain.defaultRpcUrl;
        setTransactions(prev => [{ id: txId, chainId: activeChain.id, status: 'queued', timestamp: Date.now(), summary: `转账 ${safeAmount} ${asset}` }, ...prev]);
        try {
            let hash;
            if (asset === 'NATIVE') {
                hash = await TronService.sendTrx(host, pk, recipient, Math.floor(parseFloat(safeAmount) * 1_000_000));
            } else {
                const token = activeChainTokens.find(t => t.symbol === asset);
                hash = await TronService.sendTrc20(host, pk, recipient, ethers.parseUnits(safeAmount, token?.decimals || 6).toString(), token!.address);
            }
            setTransactions(prev => prev.map(t => t.id === txId ? { ...t, hash, status: 'submitted' } : t));
            return { success: true, hash, isTimeout: true };
        } catch (e: any) {
            setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'failed', error: e.message } : t));
            return { success: false, error: e.message };
        }
    }

    try {
      let txRequest: ethers.TransactionRequest = {};
      let toAddr = recipient;
      let value = ethers.parseEther(safeAmount);
      let data = customData ? normalizeHex(customData) : '0x';

      if (asset !== 'NATIVE') {
         const token = activeChainTokens.find(t => t.symbol === asset);
         toAddr = token!.address;
         value = 0n;
         data = new ethers.Interface(ERC20_ABI).encodeFunctionData("transfer", [recipient, ethers.parseUnits(safeAmount, token!.decimals)]);
      }

      if (activeAccountType === 'EOA') {
        txRequest = { to: toAddr, value, data, gasLimit: gasLimit ? BigInt(gasLimit) : undefined, nonce };
        setTransactions(prev => [{ id: txId, chainId: activeChain.id, status: 'queued', timestamp: Date.now(), summary: `转账 ${safeAmount} ${asset}` }, ...prev]);
        return await processTransaction(txRequest, txId);
      } else {
        await handleSafeProposal(toAddr, value, data, `转账 ${safeAmount} ${asset}`);
        return { success: true, isTimeout: true, hash: "SAFE_PROPOSAL" };
      }
    } catch (e: any) { return { success: false, error: handleTxError(e) }; }
  };

  return { transactions, localNonceRef, syncNonce, handleSendSubmit, addTransactionRecord: (r: any) => setTransactions(p => [r, ...p]) };
};
