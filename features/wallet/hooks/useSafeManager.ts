
import React, { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { SAFE_ABI, PROXY_FACTORY_ABI, ZERO_ADDRESS, SENTINEL_OWNERS, getSafeConfig } from '../config';
import { ChainConfig, SafeDetails, SafePendingTx, TrackedSafe, TransactionRecord } from '../types';
import { handleTxError } from '../utils';

interface UseSafeManagerProps {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  activeSafeAddress: string | null;
  activeChainId: number;
  activeChain: ChainConfig;
  provider: ethers.JsonRpcProvider | null;
  safeDetails: SafeDetails | null;
  setPendingSafeTxs: React.Dispatch<React.SetStateAction<SafePendingTx[]>>;
  setTrackedSafes: React.Dispatch<React.SetStateAction<TrackedSafe[]>>;
  setActiveAccountType: (t: 'EOA' | 'SAFE') => void;
  setActiveSafeAddress: (addr: string) => void;
  setView: (v: any) => void;
  setNotification: (msg: string) => void;
  setError: (msg: string | null) => void;
  syncNonce: () => void;
  addTransactionRecord: (record: TransactionRecord) => void;
}

const feeCache = {
  data: null as any,
  timestamp: 0,
  chainId: 0
};

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
}: UseSafeManagerProps) => {

  const [isDeployingSafe, setIsDeployingSafe] = useState(false);
  const isProposingRef = useRef(false);

  const getFeeDataCached = async (p: ethers.JsonRpcProvider) => {
    const now = Date.now();
    if (feeCache.data && (now - feeCache.timestamp < 10000) && feeCache.chainId === activeChainId) {
      return feeCache.data;
    }
    const data = await p.getFeeData();
    feeCache.data = data;
    feeCache.timestamp = now;
    feeCache.chainId = activeChainId;
    return data;
  };

  const handleSafeProposal = async (to: string, value: bigint, data: string, summary?: string): Promise<boolean> => {
      if (!wallet || !activeSafeAddress || !provider) return false;
      
      // 修复：如果正在提议，抛出异常，让 UI 能够感知到并重置原子操作状态
      if (isProposingRef.current) {
        throw new Error("Another transaction is being prepared. Please wait.");
      }
      
      isProposingRef.current = true;
      try {
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
        const [currentNonce, owners, threshold] = await Promise.all([
           safeContract.nonce().then(n => Number(n)),
           safeContract.getOwners() as Promise<string[]>,
           safeContract.getThreshold().then(t => Number(t))
        ]);
        
        const isOwner = owners.some((o: string) => o.toLowerCase() === wallet.address.toLowerCase());
        if (!isOwner) throw new Error("当前地址不具备提议权限 (Not an owner)");
        
        const safeTxHash = await safeContract.getTransactionHash(
            to, value, data, 
            0, 0, 0, 0, 
            ZERO_ADDRESS, ZERO_ADDRESS, 
            currentNonce
        );

        const flatSig = await wallet.signMessage(ethers.getBytes(safeTxHash));
        const sig = ethers.Signature.from(flatSig);
        let v = sig.v; if (v < 30) v += 4;
        const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

        if (threshold === 1) {
           const connectedWallet = wallet.connect(provider);
           const safeWrite = safeContract.connect(connectedWallet);
           
           const feeData = await getFeeDataCached(provider);
           const overrides: any = { gasLimit: activeChain.gasLimits?.safeExec || 500000 };
           if (feeData.gasPrice) overrides.gasPrice = (feeData.gasPrice * 120n) / 100n;

           const tx = await (safeWrite as any).execTransaction(
              to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, 
              adjustedSig, 
              overrides
           );
           
           addTransactionRecord({ 
             id: Date.now().toString(), chainId: activeChainId, hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: summary || "Safe Operation"
           });
           
           setNotification("多签交易已上链执行");
           return true;
        } else {
           const newPending: SafePendingTx = {
              id: Date.now().toString(), to, value: value.toString(), data, nonce: currentNonce, safeTxHash, signatures: { [wallet.address]: adjustedSig }, summary: summary || "Safe Proposal"
           };
           setPendingSafeTxs(prev => [...prev, newPending]);
           setNotification("提案已提交至待办列表");
           setView('safe_queue');
           return true;
        }
      } catch (e: any) {
        setError(e.message || "提议失败");
        throw e;
      } finally {
        isProposingRef.current = false;
      }
  };

  const handleAddSignature = async (tx: SafePendingTx) => {
     if (!wallet) return;
     try {
        const flatSig = await wallet.signMessage(ethers.getBytes(tx.safeTxHash));
        const sig = ethers.Signature.from(flatSig);
        let v = sig.v; if (v < 30) v += 4;
        const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);
        const updatedTx = { ...tx, signatures: { ...tx.signatures, [wallet.address]: adjustedSig } };
        setPendingSafeTxs(prev => prev.map(p => p.id === tx.id ? updatedTx : p));
        setNotification("签名已同步");
     } catch (e: any) { setError(e.message); }
  };

  const handleExecutePending = async (tx: SafePendingTx) => {
     if (!wallet || !activeSafeAddress || !provider) return;
     try {
        const sortedSigners = Object.keys(tx.signatures).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        let packedSigs = "0x";
        for (const owner of sortedSigners) { packedSigs += tx.signatures[owner].slice(2); }
        
        const feeData = await getFeeDataCached(provider);
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, wallet.connect(provider));
        const overrides: any = { gasLimit: activeChain.gasLimits?.safeExec || 800000 };
        if (feeData.gasPrice) overrides.gasPrice = (feeData.gasPrice * 125n) / 100n;
        
        const execTx = await (safeContract as any).execTransaction(tx.to, BigInt(tx.value), tx.data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, packedSigs, overrides);
        
        addTransactionRecord({ 
          id: Date.now().toString(), chainId: activeChainId, hash: execTx.hash, status: 'submitted', timestamp: Date.now(), summary: tx.summary
        });
        setPendingSafeTxs(prev => prev.filter(p => p.id !== tx.id));
        setNotification("执行请求已提交至主网");
        syncNonce();
     } catch (e: any) { setError(handleTxError(e)); }
  };

  const deploySafe = async (owners: string[], threshold: number) => {
     if (!wallet || !provider) return;
     setIsDeployingSafe(true);
     try {
       const connectedWallet = wallet.connect(provider);
       const safeConfig = getSafeConfig(activeChain);
       const factory = new ethers.Contract(safeConfig.proxyFactory, PROXY_FACTORY_ABI, connectedWallet);
       const safeInterface = new ethers.Interface(SAFE_ABI);
       const setupData = safeInterface.encodeFunctionData("setup", [owners.filter(o => ethers.isAddress(o)), threshold, ZERO_ADDRESS, "0x", safeConfig.fallbackHandler, ZERO_ADDRESS, 0, ZERO_ADDRESS]);
       const saltNonce = Date.now();
       const tx = await factory.createProxyWithNonce(safeConfig.singleton, setupData, saltNonce);
       const receipt = await tx.wait();
       
       let newAddress = null;
       const topic = ethers.id("ProxyCreation(address,address)");
       for (const log of receipt.logs) { if (log.topics[0] === topic) { newAddress = ethers.getAddress(ethers.dataSlice(log.topics[1], 12)); break; } }
       
       if (newAddress) {
         setTrackedSafes(prev => [...prev, { address: newAddress, name: `Safe ${newAddress.slice(0,4)}`, chainId: activeChainId }]);
         setActiveAccountType('SAFE');
         setActiveSafeAddress(newAddress);
         setView('dashboard');
       }
     } catch (e: any) { setError(e.message); } finally { setIsDeployingSafe(false); }
  };

  const addOwnerTx = async (newOwner: string, newThresh: number) => { 
    if (!wallet || !activeSafeAddress) return false; 
    const iface = new ethers.Interface(SAFE_ABI); 
    const data = iface.encodeFunctionData("addOwnerWithThreshold", [newOwner, newThresh]); 
    return await handleSafeProposal(activeSafeAddress, 0n, data, `添加成员 ${newOwner.slice(0,6)}`); 
  };
  
  const removeOwnerTx = async (targetOwner: string, newThresh: number) => { 
    if (!wallet || !activeSafeAddress || !safeDetails) return false; 
    const index = safeDetails.owners.findIndex(o => o.toLowerCase() === targetOwner.toLowerCase()); 
    let prevOwner = index <= 0 ? SENTINEL_OWNERS : safeDetails.owners[index - 1]; 
    const iface = new ethers.Interface(SAFE_ABI); 
    const data = iface.encodeFunctionData("removeOwner", [prevOwner, targetOwner, newThresh]); 
    return await handleSafeProposal(activeSafeAddress, 0n, data, `移除成员 ${targetOwner.slice(0,6)}`); 
  };
  
  const changeThresholdTx = async (newThresh: number) => { 
    if (!wallet || !activeSafeAddress) return false; 
    const iface = new ethers.Interface(SAFE_ABI); 
    const data = iface.encodeFunctionData("changeThreshold", [newThresh]); 
    return await handleSafeProposal(activeSafeAddress, 0n, data, `门槛变更为 ${newThresh}`); 
  };

  return {
    isDeployingSafe,
    handleSafeProposal,
    handleAddSignature,
    handleExecutePending,
    deploySafe,
    addOwnerTx,
    removeOwnerTx,
    changeThresholdTx
  };
};
