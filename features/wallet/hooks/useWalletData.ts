
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { ERC20_ABI, SAFE_ABI } from '../config';
import { SafeDetails, ChainConfig, TokenConfig } from '../types';

interface UseWalletDataProps {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  activeAddress: string | null | undefined;
  activeChain: ChainConfig;
  activeAccountType: 'EOA' | 'SAFE';
  activeChainTokens: TokenConfig[];
  provider: ethers.JsonRpcProvider | null;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Hook: useWalletData
 * 
 * 作用:
 * 负责从链上获取数据。
 * 优化：通过 verifiedAddressRef 缓存合约验证状态，避免重复调用 eth_getCode。
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
}: UseWalletDataProps) => {
  
  const [balance, setBalance] = useState<string>('0.00');
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [safeDetails, setSafeDetails] = useState<SafeDetails | null>(null);
  const [currentNonce, setCurrentNonce] = useState<number>(0);
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);

  // 核心优化：记录已在当前链验证过的合约地址，避免重复 eth_getCode
  const verifiedContractRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setBalance('0.00');
      setTokenBalances({});
      setSafeDetails(null);
      setIsInitialFetchDone(false);
      verifiedContractRef.current = null;
    }
  }, [wallet]);

  // 当地址或链变化时，重置验证缓存
  useEffect(() => {
    verifiedContractRef.current = null;
  }, [activeAddress, activeChain.id]);

  /**
   * 获取链上数据
   */
  const fetchData = async () => {
    if (!wallet || !activeAddress) return;
    setIsLoading(true);

    try {
      if (activeChain.chainType === 'TRON') {
         // --- TRON 逻辑 ---
         const host = activeChain.defaultRpcUrl;
         const balSun = await TronService.getBalance(host, activeAddress);
         setBalance(ethers.formatUnits(balSun, 6)); 

         const nextBalances: Record<string, string> = {};
         await Promise.all(activeChainTokens.map(async (token) => {
            try {
               const bal = await TronService.getTrc20Balance(host, activeAddress, token.address);
               nextBalances[token.symbol] = ethers.formatUnits(bal, token.decimals || 6);
            } catch (e) {
               nextBalances[token.symbol] = '0';
            }
         }));
         setTokenBalances(nextBalances);
         setSafeDetails(null);

      } else {
         // --- EVM 逻辑 ---
         if (!provider) return;
         
         // 并行获取原生余额和 Nonce/Safe数据
         const tasks: Promise<any>[] = [provider.getBalance(activeAddress)];
         
         if (activeAccountType === 'SAFE') {
            // 优化点：只有未验证过该地址时才调用 getCode
            if (verifiedContractRef.current !== activeAddress) {
               const code = await provider.getCode(activeAddress);
               if (code === '0x' || code === '0x0') {
                  setSafeDetails(null);
                  verifiedContractRef.current = null;
                  throw new Error("NOT_A_CONTRACT");
               }
               verifiedContractRef.current = activeAddress;
            }
            
            const safeContract = new ethers.Contract(activeAddress, SAFE_ABI, provider);
            tasks.push(safeContract.getOwners());
            tasks.push(safeContract.getThreshold());
            tasks.push(safeContract.nonce());
         } else {
            tasks.push(provider.getTransactionCount(activeAddress));
         }

         const results = await Promise.all(tasks);
         setBalance(ethers.formatEther(results[0]));

         if (activeAccountType === 'SAFE') {
            setSafeDetails({ 
               owners: results[1], 
               threshold: Number(results[2]), 
               nonce: Number(results[3]) 
            });
         } else {
            setCurrentNonce(Number(results[1]));
            setSafeDetails(null);
         }

         // Token 余额获取
         const nextBalances: Record<string, string> = {};
         await Promise.all(activeChainTokens.map(async (token) => {
            try {
               const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
               const bal = await contract.balanceOf(activeAddress);
               nextBalances[token.symbol] = ethers.formatUnits(bal, token.decimals);
            } catch (e) {
               nextBalances[token.symbol] = '0';
            }
         }));
         setTokenBalances(nextBalances);
      }

    } catch (e: any) {
      console.error(e);
      if (activeAccountType === 'SAFE') {
         setSafeDetails(null);
         if (e.message === 'NOT_A_CONTRACT') return; 
         setError("Safe 连通性异常，请检查 RPC 节点状态");
      } else {
         setError("数据获取失败: " + (e.message || "网络波动"));
      }
    } finally {
      setIsLoading(false);
      setIsInitialFetchDone(true);
    }
  };

  return {
    balance,
    tokenBalances,
    safeDetails,
    setSafeDetails,
    currentNonce,
    isInitialFetchDone,
    fetchData
  };
};
