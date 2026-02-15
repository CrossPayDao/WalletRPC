
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { ERC20_ABI, SAFE_ABI } from '../config';
import { SafeDetails, ChainConfig, TokenConfig } from '../types';
import { useTranslation } from '../../../contexts/LanguageContext';

/**
 * 【数据抓取引擎 - 高可靠同步版】
 */
interface UseWalletDataParams {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  activeAddress: string | null;
  activeChain: ChainConfig;
  activeAccountType: 'EOA' | 'SAFE';
  activeChainTokens: TokenConfig[];
  provider: ethers.JsonRpcProvider | null;
  setIsLoading: (isLoading: boolean) => void;
  setError: (message: string | null) => void;
}

export const useWalletData = ({
  wallet,
  activeAddress,
  activeChain,
  activeAccountType,
  activeChainTokens,
  provider,
  setIsLoading,
  setError
}: UseWalletDataParams) => {
  const { t } = useTranslation();
  
  const [balance, setBalance] = useState<string>('0.00');
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [safeDetails, setSafeDetails] = useState<SafeDetails | null>(null);
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);
  const requestIdRef = useRef(0);

  /**
   * 【RPC 优化：合约身份缓存 (Contract Identity Cache)】
   * 意图：多签钱包地址在链上是不可变的合约。
   * 如何减少 RPC：一旦 getCode 确认过该地址为合约，verifiedContractRef 会锁死该状态。
   * 结果：在同一会话中，对同一个 Safe 地址的重复探测请求从 N 次降为 1 次。
   */
  const verifiedContractRef = useRef<string | null>(null);
  
  /**
   * 【RPC 优化：全量同步节流 (Fetch Throttling)】
   * 意图：防止用户疯狂点击“刷新”或组件频繁 Mount 导致的 RPC 风暴。
   * 策略：强制 3 秒静默期。
   */
  const lastFetchTime = useRef<number>(0);
  const FETCH_COOLDOWN = 3000; 

  // 监听钱包注销
  useEffect(() => {
    if (!wallet) {
      requestIdRef.current++;
      setIsInitialFetchDone(false);
      verifiedContractRef.current = null;
      lastFetchTime.current = 0;
      setSafeDetails(null);
      setBalance('0.00');
    }
  }, [wallet]);

  /**
   * 【关键修复：账户切换状态清理】
   * 意图：解决切换不同 Safe 或 EOA 时，UI 残留上一个账户数据的问题。
   * 逻辑：只要地址或链发生变化，立即清空内存中的合约验证状态和多签细节。
   */
  useEffect(() => {
    requestIdRef.current++;
    verifiedContractRef.current = null;
    lastFetchTime.current = 0; 
    setSafeDetails(null); // 立即清理成员列表，防止多签合约间数据污染
    setBalance('0.00');    // 重置余额显示
    setTokenBalances({}); // 重置代币列表
  }, [activeAddress, activeChain.id]);

  /**
   * 【核心同步逻辑：并行查询策略】
   */
  const fetchData = async (force: boolean = false) => {
    if (!wallet || !activeAddress) return;

    const now = Date.now();
    if (!force && (now - lastFetchTime.current < FETCH_COOLDOWN)) return;

    const requestId = ++requestIdRef.current;

    setIsLoading(true);
    try {
      lastFetchTime.current = now; 
      const currentBalances: Record<string, string> = {};

      if (activeChain.chainType === 'TRON') {
        const host = activeChain.defaultRpcUrl;
        // 波场并行同步：一次性查询原生余额和代币余额
        const [balSun, ...tokenResults] = await Promise.all([
          TronService.getBalance(host, activeAddress),
          ...activeChainTokens.map((t: TokenConfig) => TronService.getTRC20Balance(host, t.address, activeAddress))
        ]);
        if (requestId !== requestIdRef.current) return;
        
        setBalance(ethers.formatUnits(balSun, 6)); 
        activeChainTokens.forEach((t: TokenConfig, i: number) => {
           const v = ethers.formatUnits(tokenResults[i], t.decimals);
           currentBalances[t.address.toLowerCase()] = v;
           if (!(t.symbol in currentBalances)) currentBalances[t.symbol] = v;
        });
        setTokenBalances(currentBalances);
      } else {
        if (!provider) return;
        
        // --- EVM 并行同步池 ---
        // 意图：将所有必要的初始化查询压入单个 Batch。
        const baseTasks: Promise<any>[] = [provider.getBalance(activeAddress)];
        
        let isContractVerified = verifiedContractRef.current === activeAddress;
        if (activeAccountType === 'SAFE' && !isContractVerified) {
           baseTasks.push(provider.getCode(activeAddress));
        }

        const baseResults = await Promise.all(baseTasks);
        if (requestId !== requestIdRef.current) return;
        setBalance(ethers.formatEther(baseResults[0]));

        if (activeAccountType === 'SAFE' && !isContractVerified) {
           const code = baseResults[1];
           if (code !== '0x' && code !== '0x0') {
              verifiedContractRef.current = activeAddress;
              isContractVerified = true;
           }
        }

        // 如果是已验证的 Safe，并行抓取多签元数据
        if (activeAccountType === 'SAFE' && isContractVerified) {
          const safeContract = new ethers.Contract(activeAddress, SAFE_ABI, provider);
          const [owners, threshold, nonce] = await Promise.all([
             safeContract.getOwners(),
             safeContract.getThreshold(),
             safeContract.nonce()
          ]);
          if (requestId !== requestIdRef.current) return;
          // 确保写入的是当前 activeAddress 的数据
          setSafeDetails({ owners, threshold: Number(threshold), nonce: Number(nonce) });
        }

        // 批量获取 ERC20 余额
        await Promise.all(activeChainTokens.map(async (token: TokenConfig) => {
          try {
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            const bal = await contract.balanceOf(activeAddress);
            const v = ethers.formatUnits(bal, token.decimals);
            currentBalances[token.address.toLowerCase()] = v;
            if (!(token.symbol in currentBalances)) currentBalances[token.symbol] = v;
          } catch (e) {
            // Keep last-known values on transient RPC errors to avoid false zero balances.
            currentBalances[token.address.toLowerCase()] = tokenBalances[token.address.toLowerCase()] ?? '0.00';
            if (!(token.symbol in currentBalances)) currentBalances[token.symbol] = tokenBalances[token.symbol] ?? '0.00';
          }
        }));
        if (requestId !== requestIdRef.current) return;

        setTokenBalances(currentBalances);
      }
    } catch {
      setError(t('wallet.data_sync_fault'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsInitialFetchDone(true);
      }
    }
  };

  return { balance, tokenBalances, safeDetails, isInitialFetchDone, fetchData };
};
