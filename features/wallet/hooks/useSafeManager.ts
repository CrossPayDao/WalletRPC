
import React, { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { SAFE_ABI, PROXY_FACTORY_ABI, ZERO_ADDRESS, SENTINEL_OWNERS, getSafeConfig, ERC20_ABI } from '../config';
import { FeeService } from '../../../services/feeService';

/**
 * 【架构设计：多签中枢管理器】
 * 目的：封装 Gnosis Safe 的复杂交互逻辑（提议、签名、执行、部署）。
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
   * 
   * 优化点：移除了冗余的 getCode 检查。
   * 理由：在进入此逻辑前，fetchData 已经通过 eth_call 获取了 owners 和 threshold，
   * 意味着合约必然存在。在同一条链上，合约属性是静态的，无需重复验证。
   */
  const handleSafeProposal = async (to: string, value: bigint, data: string, summary?: string): Promise<boolean> => {
      if (!wallet || !activeSafeAddress || !provider) return false;
      
      if (isProposingRef.current) throw new Error("Busy...");
      isProposingRef.current = true;
      
      try {
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
        
        // 之前此处存在冗余的 provider.getCode 调用，现已移除以节省 RPC 额度。
        
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
        
        // 关键：Safe 协议兼容性修正 (V+4)
        let v = sig.v; if (v < 30) v += 4;
        const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

        if (threshold === 1) {
           const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
           const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 500000);
           const safeWrite = safeContract.connect(wallet.connect(provider));

           const tx = await (safeWrite as any).execTransaction(
              to, value, data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, adjustedSig, overrides
           );
           
           addTransactionRecord({ 
             id: Date.now().toString(), chainId: activeChainId, hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: summary || "Safe Exec"
           });
           setNotification("Transaction broadcasted directly");
           return true;
        } else {
           setPendingSafeTxs((prev: any) => [...prev, {
              id: Date.now().toString(), to, value: value.toString(), data, nonce: currentNonce, safeTxHash, signatures: { [wallet.address]: adjustedSig }, summary: summary || "Proposal"
           }]);
           setView('safe_queue');
           setNotification("Proposal added to queue");
           return true;
        }
      } catch (e: any) {
        console.error("Proposal error", e);
        if (e.code === 'BUFFER_OVERRUN') {
            setError("Data out-of-bounds error. This usually means the contract returned unexpected data. Please ensure you are on the correct network.");
        } else {
            setError(e.message || "Proposal failed");
        }
        return false;
      } finally {
        isProposingRef.current = false;
      }
  };

  /**
   * 【逻辑：部署新多签钱包 (Deployment)】
   */
  const deploySafe = async (owners: string[], threshold: number) => {
    if (!wallet || !provider) return;
    setIsDeployingSafe(true);
    try {
      const config = getSafeConfig(activeChain);
      const factory = new ethers.Contract(config.proxyFactory, PROXY_FACTORY_ABI, wallet.connect(provider));
      const safeIface = new ethers.Interface(SAFE_ABI);
      
      const initializer = safeIface.encodeFunctionData("setup", [
        owners, 
        threshold, 
        ZERO_ADDRESS, 
        "0x", 
        config.fallbackHandler, 
        ZERO_ADDRESS, 
        0, 
        ZERO_ADDRESS
      ]);

      const saltNonce = Date.now();
      
      // 1. 尝试预测地址 (staticCall) - 极其精准且在发送前完成
      let predictedAddress: string | null = null;
      try {
        predictedAddress = await (factory as any).createProxyWithNonce.staticCall(config.singleton, initializer, saltNonce);
        console.log("Predicted Safe address:", predictedAddress);
      } catch (e) {
        console.warn("Address prediction via staticCall failed, will rely on robust log parsing.", e);
      }

      const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
      const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeSetup || 2000000);

      // 2. 发起部署交易
      const tx = await factory.createProxyWithNonce(config.singleton, initializer, saltNonce, overrides);
      
      addTransactionRecord({
        id: Date.now().toString(), chainId: activeChainId, hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: "Deploying Safe Vault"
      });

      const receipt = await tx.wait();
      
      let proxyAddress: string | null = predictedAddress;
      
      // 3. 如果预测失败，或者为了多重验证，从日志中深度解析地址
      if (!proxyAddress) {
        // 定义多种版本的 ProxyCreation 事件签名 Topic
        const PROXY_CREATION_V1_TOPIC = "0x4f5193cfda12fabc88506c73f9e5c706a139a0592846990d0963ef5e056d6120"; // ProxyCreation(address,address)
        const PROXY_CREATION_V2_TOPIC = "0xe48a07f353664d6023d8c19987a027376c72956f517228a47ca61a971295b922"; // ProxyCreation(address)
        
        // 创建通用的解析器
        const universalIface = new ethers.Interface([
           "event ProxyCreation(address proxy, address singleton)",
           "event ProxyCreation(address proxy)"
        ]);

        for (const log of receipt.logs) {
          const topic0 = log.topics[0];
          if (topic0 === PROXY_CREATION_V1_TOPIC || topic0 === PROXY_CREATION_V2_TOPIC) {
            try {
              // 优先尝试基于 Interface 解析
              const decoded = universalIface.parseLog({
                  topics: [...log.topics],
                  data: log.data
              });
              
              if (decoded && decoded.args.proxy) {
                proxyAddress = decoded.args.proxy;
                break;
              }
            } catch (e) {
              // 最后的保底方案：忽略 ABI，直接按偏移量暴力截取 20 字节地址
              if (log.data && log.data.length >= 66) {
                  proxyAddress = ethers.getAddress(ethers.dataSlice(log.data, 12, 32));
                  break;
              }
            }
          }
        }
      }

      if (proxyAddress) {
        const name = `Safe_${proxyAddress.slice(2, 6)}`;
        setTrackedSafes((prev: any) => [...prev, { address: proxyAddress, name, chainId: activeChainId }]);
        setActiveSafeAddress(proxyAddress);
        setActiveAccountType('SAFE');
        setView('dashboard');
        setNotification("Safe deployed and tracked");
      } else {
        throw new Error("Safe deployed, but address extraction failed across all methods. Use 'Track Safe' and find your address on explorer.");
      }
    } catch (e: any) {
      console.error("Safe Deployment Error:", e);
      if (e.code === 'BUFFER_OVERRUN') {
        setError("Network sync failure. RPC node returned malformed log data. Please import address manually.");
      } else {
        setError(e.message || "Deployment failed");
      }
    } finally {
      setIsDeployingSafe(false);
    }
  };

  /**
   * 【逻辑：追加签名】
   */
  const handleAddSignature = async (tx: any) => {
    if (!wallet) return;
    try {
      const flatSig = await wallet.signMessage(ethers.getBytes(tx.safeTxHash));
      const sig = ethers.Signature.from(flatSig);
      let v = sig.v; if (v < 30) v += 4;
      const adjustedSig = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

      setPendingSafeTxs((prev: any) => prev.map((p: any) => 
        p.id === tx.id ? { ...p, signatures: { ...p.signatures, [wallet.address]: adjustedSig } } : p
      ));
      setNotification("Signature added");
    } catch (e: any) {
      setError(e.message);
    }
  };

  /**
   * 【逻辑：执行待处理交易】
   */
  const handleExecutePending = async (tx: any) => {
     if (!wallet || !activeSafeAddress || !provider) return;
     try {
        const sortedSigners = Object.keys(tx.signatures).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        let packedSigs = "0x";
        for (const owner of sortedSigners) packedSigs += tx.signatures[owner].slice(2);
        
        const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
        const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, wallet.connect(provider));
        const overrides = FeeService.buildOverrides(feeData, activeChain.gasLimits?.safeExec || 800000);
        
        const execTx = await (safeContract as any).execTransaction(
          tx.to, BigInt(tx.value), tx.data, 0, 0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, packedSigs, overrides
        );

        addTransactionRecord({
          id: Date.now().toString(), chainId: activeChainId, hash: execTx.hash, status: 'submitted', timestamp: Date.now(), summary: tx.summary
        });

        setPendingSafeTxs((prev: any) => prev.filter((p: any) => p.id !== tx.id));
        setNotification("Safe transaction executed");
     } catch (e: any) {
        setError(e.message);
     }
  };

  /**
   * 【逻辑：多签钱包管理交易】
   */
  const addOwnerTx = async (owner: string, threshold: number) => {
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI);
    const data = safeContract.interface.encodeFunctionData("addOwnerWithThreshold", [owner, threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `Add Owner: ${owner.slice(0,6)}`);
  };

  const removeOwnerTx = async (owner: string, threshold: number) => {
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI, provider);
    const owners = await safeContract.getOwners();
    const prevOwner = owners.indexOf(owner) === 0 ? SENTINEL_OWNERS : owners[owners.indexOf(owner) - 1];
    const data = safeContract.interface.encodeFunctionData("removeOwner", [prevOwner, owner, threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `Remove Owner: ${owner.slice(0,6)}`);
  };

  const changeThresholdTx = async (threshold: number) => {
    const safeContract = new ethers.Contract(activeSafeAddress, SAFE_ABI);
    const data = safeContract.interface.encodeFunctionData("changeThreshold", [threshold]);
    return handleSafeProposal(activeSafeAddress, 0n, data, `Change Threshold: ${threshold}`);
  };

  return { 
    isDeployingSafe, handleSafeProposal, deploySafe, handleAddSignature, handleExecutePending,
    addOwnerTx, removeOwnerTx, changeThresholdTx
  };
};
