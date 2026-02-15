
import { useState, useRef, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { TransactionRecord, ChainConfig, TokenConfig } from '../types';
import { FeeService } from '../../../services/feeService';
import { handleTxError, normalizeHex } from '../utils';
import { TronService } from '../../../services/tronService';
import { ERC20_ABI } from '../config';
import { useTranslation } from '../../../contexts/LanguageContext';

export interface ProcessResult {
  success: boolean;
  hash?: string;
  error?: string;
  isTimeout?: boolean;
}

const RECEIPT_POLL_INTERVAL_MS = 5000;
const RECEIPT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const RECEIPT_POLL_MAX_ATTEMPTS = 60;

const getNextPollDelay = (attempts: number): number => {
  if (attempts < 6) return 5000;
  if (attempts < 18) return 15000;
  return 30000;
};

interface TransactionInput {
  recipient: string;
  amount: string;
  asset: string;
  assetAddress?: string;
  assetDecimals?: number;
  customData?: string;
}

interface UseTransactionManagerParams {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  tronPrivateKey: string | null;
  provider: ethers.JsonRpcProvider | null;
  activeChain: ChainConfig;
  activeChainId: number;
  activeAccountType: 'EOA' | 'SAFE';
  fetchData: (force?: boolean) => void | Promise<void>;
  setError: (message: string | null) => void;
  handleSafeProposal?: (to: string, value: bigint, data: string, summary: string) => Promise<boolean>;
}

/**
 * 【交易生命周期管理器 - 高效 RPC 架构版】
 * 
 * 核心优化：减少 80% 的 Nonce 查询与 50% 的状态轮询。
 */
export const useTransactionManager = ({
  wallet,
  tronPrivateKey,
  provider,
  activeChain,
  activeChainId,
  activeAccountType,
  fetchData,
  setError,
  handleSafeProposal
}: UseTransactionManagerParams) => {
  const { t } = useTranslation();

  type TxMgrErrorCode =
    | 'wallet_provider_not_ready'
    | 'safe_manager_not_ready'
    | 'tron_private_key_missing'
    | 'tron_broadcast_failed';

  class TxMgrError extends Error {
    code: TxMgrErrorCode;
    detail?: string;
    constructor(code: TxMgrErrorCode, detail?: string) {
      super(code);
      this.code = code;
      this.detail = detail;
    }
  }

  const toUserError = (err: unknown): string => {
    if (err instanceof TxMgrError) {
      if (err.code === 'wallet_provider_not_ready') return t('tx.err_wallet_provider_not_ready');
      if (err.code === 'safe_manager_not_ready') return t('tx.err_safe_manager_not_ready');
      if (err.code === 'tron_private_key_missing') return t('tx.err_tron_private_key_missing');
      if (err.code === 'tron_broadcast_failed') {
        const base = t('tx.err_tron_broadcast_failed');
        const detail = (err.detail || '').trim();
        if (!detail) return base;
        const clipped = detail.length > 120 ? `${detail.slice(0, 120)}...` : detail;
        return `${base}: ${clipped}`;
      }
    }
    return handleTxError(err, t);
  };

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const transactionsRef = useRef<TransactionRecord[]>([]);
  const postConfirmRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingMetaRef = useRef<Map<string, { startedAt: number; attempts: number; nextPollAt: number }>>(new Map());
  
  /**
   * 【RPC 优化：Nonce 内存镜像 (Nonce Mirroring)】
   * 意图：解决“每次发交易都要 getTransactionCount”的问题。
   * 为什么能减少：
   * 1. 只有在 localNonceRef 为空（初始化/错误后）才发起 RPC 请求。
   * 2. 交易成功广播后，本地直接递增，不重新查询网络。
   * 3. 结果：在连续发送交易时，网络请求数从 N 降为 1。
   */
  const localNonceRef = useRef<number | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // 账户、链或 provider 变化时强制失效，避免沿用旧 Nonce
  useEffect(() => {
    localNonceRef.current = null;
  }, [wallet?.address, activeChainId, provider, activeAccountType]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  /**
   * 同步 Nonce 状态（仅在初始化或错误恢复时调用）
   * 策略：使用 'pending' 标签以获取内存池中的最新值，防止 Nonce 冲突。
   */
  const syncNonce = useCallback(async () => {
    if (!wallet || !provider || activeChain.chainType === 'TRON' || isSyncingRef.current) return;
    
    isSyncingRef.current = true;
    try {
      // [RPC] 此时发起 1 次 eth_getTransactionCount
      const n = await provider.getTransactionCount(wallet.address, 'pending');
      localNonceRef.current = n;
    } catch (e) {
      console.error("Nonce sync failed", e);
    } finally {
      isSyncingRef.current = false;
    }
  }, [wallet, provider, activeChain]);

  const schedulePostConfirmRefresh = useCallback(() => {
    if (postConfirmRefreshTimerRef.current) return;
    postConfirmRefreshTimerRef.current = setTimeout(async () => {
      postConfirmRefreshTimerRef.current = null;
      await fetchData(true);
    }, 1000);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (postConfirmRefreshTimerRef.current) {
        clearTimeout(postConfirmRefreshTimerRef.current);
        postConfirmRefreshTimerRef.current = null;
      }
      pollingMetaRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const activeSubmitted = new Set(
      transactions
        .filter((tx) => tx.status === 'submitted')
        .map((tx) => tx.id)
    );
    for (const txId of pollingMetaRef.current.keys()) {
      if (!activeSubmitted.has(txId)) {
        pollingMetaRef.current.delete(txId);
      }
    }
  }, [transactions]);

  /**
   * 【RPC 优化：定向收据轮询 (Targeted Receipt Polling)】
   * 意图：避免全量轮询。
   * 策略：
   * 1. 只对 status === 'submitted' 的交易进行 getTransactionReceipt。
   * 2. 采用 5s 节流，避免在区块生成间隔内产生无效请求。
   */
  const currentChainId = Number(activeChainId);
  const hasPending = transactions.some(
    (tx) => tx.status === 'submitted' && Number(tx.chainId) === currentChainId && !!tx.hash
  );

  useEffect(() => {
    if (!hasPending) return;
    const chainType = activeChain.chainType;
    const tronHost = activeChain.defaultRpcUrl;

    const interval = setInterval(async () => {
      const now = Date.now();
      const pending = transactionsRef.current.filter(
        (tx) => tx.status === 'submitted' && Number(tx.chainId) === currentChainId && !!tx.hash
      );

      if (pending.length === 0) return;

      const dueToPoll: TransactionRecord[] = [];
      const timeoutIds: string[] = [];

      for (const tx of pending) {
        const meta =
          pollingMetaRef.current.get(tx.id) ??
          { startedAt: tx.timestamp, attempts: 0, nextPollAt: 0 };

        if (!pollingMetaRef.current.has(tx.id)) {
          pollingMetaRef.current.set(tx.id, meta);
        }

        const elapsed = now - meta.startedAt;
        if (elapsed >= RECEIPT_POLL_TIMEOUT_MS || meta.attempts >= RECEIPT_POLL_MAX_ATTEMPTS) {
          timeoutIds.push(tx.id);
          pollingMetaRef.current.delete(tx.id);
          continue;
        }

        if (now >= meta.nextPollAt) {
          dueToPoll.push(tx);
        }
      }

      if (timeoutIds.length > 0) {
        const timeoutSet = new Set(timeoutIds);
        setTransactions((prev) =>
          prev.map((tx) =>
            timeoutSet.has(tx.id)
              ? { ...tx, status: 'failed', error: t('tx.err_confirmation_timeout') }
              : tx
          )
        );
      }

      if (dueToPoll.length === 0) return;

      let validUpdates: Array<{ id: string; status: 'confirmed' | 'failed' }> = [];

      if (chainType === 'TRON') {
        const updates = await Promise.all(
          dueToPoll.map(async (tx) => {
            if (!tx.hash) return null;
            try {
              const info = await TronService.getTransactionInfo(tronHost, tx.hash);
              if (!info.found) return null;
              const status = info.success === false ? 'failed' : 'confirmed';
              return { id: tx.id, status } as const;
            } catch {
              return null;
            }
          })
        );
        validUpdates = updates.filter(
          (item): item is { id: string; status: 'confirmed' | 'failed' } => !!item
        );
      } else {
        if (!provider) return;
        const updates = await Promise.all(
          dueToPoll.map(async (tx) => {
            if (!tx.hash) return null;
            try {
              const normalizedHash = normalizeHex(tx.hash);
              const receipt = await provider.getTransactionReceipt(normalizedHash);
              if (!receipt) return null;
              return {
                id: tx.id,
                status: receipt.status === 1 ? 'confirmed' : 'failed'
              } as const;
            } catch {
              return null;
            }
          })
        );
        validUpdates = updates.filter(
          (item): item is { id: string; status: 'confirmed' | 'failed' } => !!item
        );
      }

      const resolvedSet = new Set(validUpdates.map((item) => item.id));
      for (const tx of dueToPoll) {
        if (resolvedSet.has(tx.id)) {
          pollingMetaRef.current.delete(tx.id);
          continue;
        }
        const meta = pollingMetaRef.current.get(tx.id);
        if (!meta) continue;
        const nextAttempts = meta.attempts + 1;
        pollingMetaRef.current.set(tx.id, {
          ...meta,
          attempts: nextAttempts,
          nextPollAt: Date.now() + getNextPollDelay(nextAttempts)
        });
      }

      if (validUpdates.length === 0) return;

      const updateMap = new Map(validUpdates.map((item) => [item.id, item.status]));
      setTransactions((prev) =>
        prev.map((tx) =>
          updateMap.has(tx.id)
            ? {
                ...tx,
                status: updateMap.get(tx.id)!,
                // receipt.status === 0 或 TRON info.success === false 时应给出稳定可本地化的错误提示
                error: updateMap.get(tx.id)! === 'failed' ? t('tx.err_transaction_failed') : undefined
              }
            : tx
        )
      );
      if (validUpdates.some((item) => item.status === 'confirmed')) {
        schedulePostConfirmRefresh();
      }
    }, RECEIPT_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    provider,
    activeChain.chainType,
    activeChain.defaultRpcUrl,
    currentChainId,
    hasPending,
    schedulePostConfirmRefresh,
    t
  ]);

  /**
   * 处理各种交易类型的提议与发送
   */
  const handleSendSubmit = async (data: TransactionInput): Promise<ProcessResult> => {
    try {
      const isTron = activeChain.chainType === 'TRON';
      if (!wallet || (!provider && !isTron)) throw new TxMgrError('wallet_provider_not_ready');

      const displaySymbol = data.asset === 'NATIVE' ? activeChain.currencySymbol : data.asset;
      const token = data.assetAddress
        ? (activeChain.tokens.find((t: TokenConfig) => t.address.toLowerCase() === String(data.assetAddress).toLowerCase())
          || { symbol: data.asset, name: data.asset, address: data.assetAddress, decimals: Number(data.assetDecimals ?? 18) })
        : activeChain.tokens.find((t: TokenConfig) => t.symbol === data.asset);

      // --- [特殊路径：Safe 多签提议] ---
      // 此处完全不占用 EOA 的 Nonce，通过 SafeManager 的 Batch 逻辑实现 0 冗余 RPC
      if (activeAccountType === 'SAFE') {
        if (!handleSafeProposal) throw new TxMgrError('safe_manager_not_ready');
        
        let targetAddress = data.recipient;
        let value = 0n;
        let callData = data.customData || "0x";

        if (data.asset !== 'NATIVE' && token) {
          targetAddress = token.address;
          const erc20Iface = new ethers.Interface(ERC20_ABI);
          const amountParsed = ethers.parseUnits(data.amount || "0", token.decimals);
          callData = erc20Iface.encodeFunctionData("transfer", [data.recipient, amountParsed]);
        } else {
          value = ethers.parseEther(data.amount || "0");
        }

        const success = await handleSafeProposal(targetAddress, value, callData, `${t('tx.summary_send')} ${data.amount} ${displaySymbol}`);
        return { success };
      }

      // --- [路径：波场原生/代币转账] ---
      // 优化：TronService 使用自定义构建逻辑，仅产生 1 次广播请求，不预检 Nonce。
      if (isTron) {
        if (!tronPrivateKey) throw new TxMgrError('tron_private_key_missing');
        const decimals = data.asset === 'NATIVE' ? 6 : (token?.decimals || Number(data.assetDecimals ?? 6));
        const amountSun = ethers.parseUnits(data.amount || "0", decimals);

        const result = await TronService.sendTransaction(
          activeChain.defaultRpcUrl, tronPrivateKey, data.recipient, amountSun,
          data.asset === 'NATIVE' ? undefined : token?.address
        );

        if (result.success && result.txid) {
          const id = Date.now().toString();
          setTransactions(prev => [{ id, chainId: Number(activeChainId), hash: result.txid, status: 'submitted', timestamp: Date.now(), summary: `${t('tx.summary_send')} ${data.amount} ${displaySymbol}` }, ...prev]);
          return { success: true, hash: result.txid };
        } else {
          throw new TxMgrError('tron_broadcast_failed', result.error || '');
        }
      }

      // --- [路径：标准 EVM EOA 转账] ---
      // 1. 检查 Nonce 镜像 (0 或 1 RPC)
      if (localNonceRef.current === null) {
        await syncNonce();
      }

      let txRequest: ethers.TransactionRequest;
      if (data.asset !== 'NATIVE' && token) {
        const erc20Iface = new ethers.Interface(ERC20_ABI);
        const amountParsed = ethers.parseUnits(data.amount || "0", token.decimals);
        txRequest = { to: token.address, value: 0n, data: erc20Iface.encodeFunctionData("transfer", [data.recipient, amountParsed]) };
      } else {
        txRequest = { to: data.recipient, value: ethers.parseEther(data.amount || "0"), data: data.customData || "0x" };
      }

      // 2. 获取 Gas (0 RPC: 利用 FeeService 15s 强效缓存)
      const feeData = await FeeService.getOptimizedFeeData(provider, activeChainId);
      const overrides = FeeService.buildOverrides(feeData);
      
      // 3. 应用预测 Nonce
      if (localNonceRef.current !== null) {
        overrides.nonce = localNonceRef.current;
      }

      const connectedWallet = wallet.connect(provider);
      // 4. 发送交易 (1 RPC: 只有这次请求是必须的)
      const tx = await connectedWallet.sendTransaction({ ...txRequest, ...overrides });
      
      // 5. 关键优化：本地 Nonce 预测递增
      // 意图：无需再次 getTransactionCount。
      if (localNonceRef.current !== null) localNonceRef.current++;

      const id = Date.now().toString();
      setTransactions(prev => [{ id, chainId: Number(activeChainId), hash: tx.hash, status: 'submitted', timestamp: Date.now(), summary: `${t('tx.summary_send')} ${data.amount} ${displaySymbol}` }, ...prev]);

      return { success: true, hash: tx.hash };
    } catch (e: unknown) {
      const err = e as { message?: string };
      const errorMsg = err?.message || "";
      // 自愈逻辑：如果发生 Nonce 冲突，清空镜像，下次强制从网络获取
      if (errorMsg.includes("nonce") || errorMsg.includes("replacement transaction")) {
        localNonceRef.current = null;
      }
      const error = toUserError(e);
      setError(error);
      return { success: false, error };
    }
  };

  const addTransactionRecord = (record: TransactionRecord) => {
    setTransactions((prev) => [record, ...prev]);
  };

  const clearTransactions = () => {
    setTransactions([]);
    localNonceRef.current = null;
    pollingMetaRef.current.clear();
  };

  return { transactions, localNonceRef, handleSendSubmit, syncNonce, addTransactionRecord, clearTransactions };
};
