
import { useState, useEffect } from 'react';
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
 * 包括：原生余额、Token 余额、Safe 合约详情 (Owners, Threshold, Nonce)。
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
  
  /** 原生代币余额 */
  const [balance, setBalance] = useState<string>('0.00');
  
  /** Token 余额映射表 */
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  
  /** Safe 详情 (仅 SAFE 模式) */
  const [safeDetails, setSafeDetails] = useState<SafeDetails | null>(null);
  
  /** EOA 当前 Nonce (仅 EOA 模式) */
  const [currentNonce, setCurrentNonce] = useState<number>(0);

  /** 初始数据加载完成标志 */
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);

  // 当钱包重置时，重置状态
  useEffect(() => {
    if (!wallet) {
      setBalance('0.00');
      setTokenBalances({});
      setSafeDetails(null);
      setIsInitialFetchDone(false);
    }
  }, [wallet]);

  /**
   * 获取链上数据
   * 区分 EVM 和 TRON 的获取逻辑。
   */
  const fetchData = async () => {
    if (!wallet || !activeAddress) return;
    setIsLoading(true);
    // 注意：不要在这里重置 setError(null)，允许静默刷新
    // 也不要重置 isInitialFetchDone，因为它只表示"至少成功加载过一次"

    try {
      if (activeChain.chainType === 'TRON') {
         // --- TRON 逻辑 (HTTP API) ---
         const host = activeChain.defaultRpcUrl;
         const balSun = await TronService.getBalance(host, activeAddress);
         setBalance(ethers.formatUnits(balSun, 6)); 

         const nextBalances: Record<string, string> = {};
         await Promise.all(activeChainTokens.map(async (token) => {
            try {
               const bal = await TronService.getTrc20Balance(host, activeAddress, token.address);
               const decimals = token.decimals || 6;
               nextBalances[token.symbol] = ethers.formatUnits(bal, decimals);
            } catch (e) {
               nextBalances[token.symbol] = '0';
            }
         }));
         setTokenBalances(nextBalances);
         setSafeDetails(null);

      } else {
         // --- EVM 逻辑 (JSON-RPC) ---
         if (!provider) return;
         const nativeBal = await provider.getBalance(activeAddress);
         setBalance(ethers.formatEther(nativeBal));

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

         if (activeAccountType === 'SAFE') {
            // 安全检查 1: 确保地址是有效的合约地址
            const code = await provider.getCode(activeAddress);
            if (code === '0x' || code === '0x0') {
               // 如果当前网络没有这个 Safe，静默失败，不要报错
               // 这样 useEvmWallet 的副作用可以安全地切换回 EOA 而不弹出错误
               setSafeDetails(null);
               return; 
            } else {
               const safeContract = new ethers.Contract(activeAddress, SAFE_ABI, provider);
               const [owners, threshold, nonce] = await Promise.all([
                  safeContract.getOwners(),
                  safeContract.getThreshold(),
                  safeContract.nonce()
               ]);
               setSafeDetails({ owners, threshold: Number(threshold), nonce: Number(nonce) });
            }
         } else {
            const txCount = await provider.getTransactionCount(activeAddress);
            setCurrentNonce(txCount);
            setSafeDetails(null);
         }
      }

    } catch (e: any) {
      console.error(e);
      // 如果是 SAFE 模式下的错误，提供友好的提示
      if (activeAccountType === 'SAFE') {
         setSafeDetails(null);
         // Fixed: Sync error string check to 'NOT_A_CONTRACT'
         if (e.message === 'NOT_A_CONTRACT') return;
         
         if (e.code === 'BAD_DATA' || e.message?.includes('call revert')) {
             setError("无法读取 Safe 合约数据，请确保地址正确且部署在当前网络。");
         } else {
             setError("Safe 数据加载失败: " + (e.reason || e.message));
         }
      } else {
         if (e.code === 'NETWORK_ERROR') setError("网络错误: RPC 节点无法连接");
         else setError("数据获取失败: " + (e.message || "未知错误"));
      }
    } finally {
      setIsLoading(false);
      // 标记初始加载完成
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
