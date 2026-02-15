
import { useState, useEffect } from 'react';
import { DEFAULT_CHAINS } from '../config';
import { ChainConfig, TokenConfig, TrackedSafe, SafePendingTx } from '../types';

const STORAGE_KEYS = {
  trackedSafes: { current: 'walletrpc_tracked_safes', legacy: 'zerostate_tracked_safes' },
  customChains: { current: 'walletrpc_custom_chains', legacy: 'zerostate_custom_chains' },
  customTokens: { current: 'walletrpc_custom_tokens', legacy: 'zerostate_custom_tokens' },
  pendingSafeTxs: { current: 'walletrpc_pending_safe_txs', legacy: 'zerostate_pending_safe_txs' }
} as const;

/**
 * 【架构设计：声明式持久化层 (Persistence Layer)】
 * 目的：管理所有需要跨页面刷新存在的用户数据。
 * 背景：如果直接在每个组件里读写 localStorage，会导致数据不一致。
 * 解决：将 storage 集中在 Hook 中，利用 React State 同步本地存储。
 * 性能优势：使用 useEffect 进行选择性同步，仅在对应字段变化时触发 I/O。
 */
export const useWalletStorage = () => {
  const [trackedSafes, setTrackedSafes] = useState<TrackedSafe[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>(DEFAULT_CHAINS);
  const [customTokens, setCustomTokens] = useState<Record<number, TokenConfig[]>>({});
  const [pendingSafeTxs, setPendingSafeTxs] = useState<SafePendingTx[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const safeGetItem = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeSetItem = (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore (private mode / denied access)
    }
  };

  const safeRemoveItem = (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };

  const parseRawJson = <T,>(key: string, raw: string, fallback: T): { value: T; ok: boolean } => {
    if (!raw) return { value: fallback, ok: false };
    try {
      return { value: JSON.parse(raw) as T, ok: true };
    } catch (error) {
      console.warn(`Storage parse failed for key: ${key}`, error);
      return { value: fallback, ok: false };
    }
  };

  const readWithMigration = <T,>(keys: { current: string; legacy: string }, fallback: T): T => {
    const currentRaw = safeGetItem(keys.current);
    if (currentRaw != null) {
      const parsed = parseRawJson<T>(keys.current, currentRaw, fallback);
      if (parsed.ok) return parsed.value;

      // current key 损坏时尝试回退 legacy，以最大化可恢复性
      const legacyRaw = safeGetItem(keys.legacy);
      if (legacyRaw != null) {
        const legacyParsed = parseRawJson<T>(keys.legacy, legacyRaw, fallback);
        if (legacyParsed.ok) {
          safeSetItem(keys.current, JSON.stringify(legacyParsed.value));
          safeRemoveItem(keys.legacy);
          return legacyParsed.value;
        }
      }
      return fallback;
    }

    const legacyRaw = safeGetItem(keys.legacy);
    if (legacyRaw != null) {
      const legacyParsed = parseRawJson<T>(keys.legacy, legacyRaw, fallback);
      if (legacyParsed.ok) {
        safeSetItem(keys.current, JSON.stringify(legacyParsed.value));
        safeRemoveItem(keys.legacy);
        return legacyParsed.value;
      }
    }

    return fallback;
  };

  /**
   * 【逻辑：智能配置合并 (Smart Config Merging)】
   * 为什么：当开发者更新了 DEFAULT_CHAINS（例如增加了新代币），不能直接被用户的旧存储覆盖。
   * 解决：
   * 1. 以代码中的最新的静态配置为基准。
   * 2. 遍历 localStorage，仅将用户自定义的字段（如 RPC URL）覆盖到静态对象上。
   * 好处：用户既能保留自定义设置，又能自动获得开发者新添加的代币或浏览器链接。
   */
  useEffect(() => {
    const savedSafes = readWithMigration<unknown>(STORAGE_KEYS.trackedSafes, []);
    if (Array.isArray(savedSafes) && savedSafes.length > 0) {
      setTrackedSafes(savedSafes as TrackedSafe[]);
    }

    const customChainConfigsRaw = readWithMigration<unknown>(STORAGE_KEYS.customChains, []);
    const customChainConfigs = Array.isArray(customChainConfigsRaw)
      ? (customChainConfigsRaw as ChainConfig[])
      : [];
    if (customChainConfigs.length > 0) {
      const mergedChains = DEFAULT_CHAINS.map((defaultChain) => {
        const override = customChainConfigs.find((chain) => chain.id === defaultChain.id);
        if (override) {
          return {
            ...defaultChain,
            ...override,
            explorers: defaultChain.explorers,
            isCustom: true
          };
        }
        return defaultChain;
      });

      customChainConfigs.forEach((customChain) => {
        if (!mergedChains.find((chain) => chain.id === customChain.id)) {
          mergedChains.push(customChain);
        }
      });
      setChains(mergedChains);
    }

    const savedTokens = readWithMigration<unknown>(STORAGE_KEYS.customTokens, {});
    if (savedTokens && typeof savedTokens === 'object' && Object.keys(savedTokens).length > 0) {
      setCustomTokens(savedTokens as Record<number, TokenConfig[]>);
    }

    const savedSafeTxs = readWithMigration<unknown>(STORAGE_KEYS.pendingSafeTxs, []);
    if (Array.isArray(savedSafeTxs) && savedSafeTxs.length > 0) {
      setPendingSafeTxs(savedSafeTxs as SafePendingTx[]);
    }

    setHydrated(true);
  }, []);

  // --- 自动保存触发器 ---
  // 这种模式确保了“UI 状态即存储状态”，开发者无需手动调用 save()
  useEffect(() => {
    if (!hydrated) return;
    safeSetItem(STORAGE_KEYS.trackedSafes.current, JSON.stringify(trackedSafes));
    safeRemoveItem(STORAGE_KEYS.trackedSafes.legacy);
  }, [trackedSafes, hydrated]);

  useEffect(() => {
     if (!hydrated) return;
     const chainsToSave = chains.filter(c => c.isCustom);
     safeSetItem(STORAGE_KEYS.customChains.current, JSON.stringify(chainsToSave));
     safeRemoveItem(STORAGE_KEYS.customChains.legacy);
  }, [chains, hydrated]);

  useEffect(() => {
     if (!hydrated) return;
     safeSetItem(STORAGE_KEYS.customTokens.current, JSON.stringify(customTokens));
     safeRemoveItem(STORAGE_KEYS.customTokens.legacy);
  }, [customTokens, hydrated]);

  useEffect(() => {
     if (!hydrated) return;
     safeSetItem(STORAGE_KEYS.pendingSafeTxs.current, JSON.stringify(pendingSafeTxs));
     safeRemoveItem(STORAGE_KEYS.pendingSafeTxs.legacy);
  }, [pendingSafeTxs, hydrated]);

  return { trackedSafes, setTrackedSafes, chains, setChains, customTokens, setCustomTokens, pendingSafeTxs, setPendingSafeTxs };
};
