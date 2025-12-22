
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { ERC20_ABI, SAFE_ABI } from '../config';
import { SafeDetails, ChainConfig, TokenConfig } from '../types';

/**
 * 【数据层核心 Hook】
 * 目的：解耦链上数据获取逻辑。
 * 解决问题：补全代币余额获取逻辑，实现多链并行查询。
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
   * 【逻辑：全量数据同步】
   */
  const fetchData = async () => {
    if (!wallet || !activeAddress) return;

    setIsLoading(true);
    try {
      const currentBalances: Record<string, string> = {};

      if (activeChain.chainType === 'TRON') {
        const host = activeChain.defaultRpcUrl;
        
        // 1. 获取 TRX 余额
        const balSun = await TronService.getBalance(host, activeAddress);
        setBalance(ethers.formatUnits(balSun, 6)); 

        // 2. 获取所有 TRC20 代币余额
        await Promise.all(activeChainTokens.map(async (token: TokenConfig) => {
          const bal = await TronService.getTRC20Balance(host, token.address, activeAddress);
          currentBalances[token.symbol] = ethers.formatUnits(bal, token.decimals);
        }));
        
        setTokenBalances(currentBalances);
      } else {
        if (!provider) return;
        
        // 1. 原生代币与账户基础信息任务
        const baseTasks: Promise<any>[] = [provider.getBalance(activeAddress)];
        let isContractVerified = true;
        
        if (activeAccountType === 'SAFE') {
          if (verifiedContractRef.current !== activeAddress) {
            try {
              const code = await provider.getCode(activeAddress);
              if (code === '0x' || code === '0x0') {
                isContractVerified = false;
              } else {
                verifiedContractRef.current = activeAddress;
              }
            } catch (e) { isContractVerified = false; }
          }
          
          if (isContractVerified) {
            const safeContract = new ethers.Contract(activeAddress, SAFE_ABI, provider);
            baseTasks.push(safeContract.getOwners(), safeContract.getThreshold(), safeContract.nonce());
          }
        }

        const baseResults = await Promise.all(baseTasks);
        setBalance(ethers.formatEther(baseResults[0]));

        if (activeAccountType === 'SAFE' && isContractVerified && baseResults.length > 1) {
          setSafeDetails({
            owners: baseResults[1],
            threshold: Number(baseResults[2]),
            nonce: Number(baseResults[3])
          });
        }

        // 2. 批量获取所有 ERC20 代币余额
        const tokenTasks = activeChainTokens.map(async (token: TokenConfig) => {
          try {
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            const bal = await contract.balanceOf(activeAddress);
            currentBalances[token.symbol] = ethers.formatUnits(bal, token.decimals);
          } catch (e) {
            console.warn(`Failed to fetch balance for ${token.symbol}`, e);
            currentBalances[token.symbol] = '0.00';
          }
        });

        await Promise.all(tokenTasks);
        setTokenBalances(currentBalances);
      }
    } catch (e: any) {
      console.error(e);
      setError("Data synchronization fault");
    } finally {
      setIsLoading(false);
      setIsInitialFetchDone(true);
    }
  };

  return { balance, tokenBalances, safeDetails, isInitialFetchDone, fetchData };
};
