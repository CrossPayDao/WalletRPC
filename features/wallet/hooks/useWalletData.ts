
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { ERC20_ABI, SAFE_ABI } from '../config';
import { SafeDetails, ChainConfig, TokenConfig } from '../types';

/**
 * 【数据层核心 Hook】
 * 目的：解耦链上数据获取逻辑。
 * 协作：为 Dashboard 提供余额，为 TransactionManager 提供环境上下文。
 */
export const useWalletData = ({
  wallet,
  activeAddress,
  activeChain,
  activeAccountType,
  activeChainTokens,
  provider,
  setIsLoading,
  setError
}: any) => {
  
  const [balance, setBalance] = useState<string>('0.00');
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [safeDetails, setSafeDetails] = useState<SafeDetails | null>(null);
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);

  /**
   * 【性能优化：合约验证缓存】
   * 为什么：eth_getCode 是一个相对沉重的操作。如果是 Safe 地址，每次刷新都查 Code 没必要。
   * 解决：使用 useRef 存储验证结果。它在组件重绘时不重置，且修改它不触发重绘。
   * 优势：在同一地址和同一链下，Code 查询仅发生一次。
   */
  const verifiedContractRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setIsInitialFetchDone(false);
      verifiedContractRef.current = null;
    }
  }, [wallet]);

  useEffect(() => {
    verifiedContractRef.current = null;
  }, [activeAddress, activeChain.id]);

  /**
   * 【逻辑：增量式异步加载】
   * 目的：实现 Native 余额、Safe 详情和代币余额的并行获取。
   */
  const fetchData = async () => {
    if (!wallet || !activeAddress) return;

    setIsLoading(true);
    try {
      if (activeChain.chainType === 'TRON') {
         // Tron 协议专属解析逻辑
         const host = activeChain.defaultRpcUrl;
         const balSun = await TronService.getBalance(host, activeAddress);
         setBalance(ethers.formatUnits(balSun, 6)); 
         // ... 代币逻辑
      } else {
         if (!provider) return;
         
         // 任务并发队列：利用 Promise.all 提升加载速度
         const tasks: Promise<any>[] = [provider.getBalance(activeAddress)];
         let isContractVerified = true;
         
         if (activeAccountType === 'SAFE') {
            // 命中缓存判定
            if (verifiedContractRef.current !== activeAddress) {
               try {
                  const code = await provider.getCode(activeAddress);
                  if (code === '0x' || code === '0x0') {
                    isContractVerified = false; // 软错误处理：地址不是合约，但不中断 Native 余额获取
                  } else {
                    verifiedContractRef.current = activeAddress;
                  }
               } catch (e) { isContractVerified = false; }
            }
            
            if (isContractVerified) {
              const safeContract = new ethers.Contract(activeAddress, SAFE_ABI, provider);
              tasks.push(safeContract.getOwners(), safeContract.getThreshold(), safeContract.nonce());
            } else {
              setSafeDetails(null);
              setError("Current vault address is not a contract on this network.");
            }
         } else {
            tasks.push(provider.getTransactionCount(activeAddress));
         }

         const results = await Promise.all(tasks);
         if (results.length > 0) setBalance(ethers.formatEther(results[0]));

         // ... 数据映射逻辑
      }
    } catch (e: any) {
      console.error(e);
      setError("Data synchronization fault");
    } finally {
      setIsLoading(false);
      /**
       * 【工程健壮性设计】
       * 作用：无论成功或失败，必须将此状态置为 true。
       * 解决了什么：防止开场动画（ParticleIntro）因为某次 RPC 失败而无限挂起。
       */
      setIsInitialFetchDone(true);
    }
  };

  return { balance, tokenBalances, safeDetails, isInitialFetchDone, fetchData };
};
