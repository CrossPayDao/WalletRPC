

import { useState, useEffect } from 'react';
import { DEFAULT_CHAINS } from '../config';
import { ChainConfig, TokenConfig, TrackedSafe, SafePendingTx } from '../types';

/**
 * Hook: useWalletStorage
 * 
 * 作用:
 * 管理所有需要持久化到 LocalStorage 的钱包状态。
 * 将数据持久化逻辑与核心交易逻辑分离，保持代码整洁。
 * 
 * 包含状态:
 * 1. trackedSafes: 用户追踪的 Gnosis Safe 钱包列表
 * 2. chains: 网络配置列表 (包含用户添加的自定义网络)
 * 3. customTokens: 用户添加的自定义代币
 * 4. pendingSafeTxs: 本地待处理/待签名的 Safe 交易队列
 * 
 * @returns 返回状态变量及其对应的 Setter 函数
 */
export const useWalletStorage = () => {
  // --- 状态定义 ---
  
  /** 用户追踪的 Safe 钱包列表 */
  const [trackedSafes, setTrackedSafes] = useState<TrackedSafe[]>([]);
  
  /** 链配置列表（默认链 + 用户自定义链） */
  const [chains, setChains] = useState<ChainConfig[]>(DEFAULT_CHAINS);
  
  /** 自定义代币 Map，Key 为 ChainID */
  const [customTokens, setCustomTokens] = useState<Record<number, TokenConfig[]>>({});
  
  /** 待处理的 Safe 多签交易队列 */
  const [pendingSafeTxs, setPendingSafeTxs] = useState<SafePendingTx[]>([]);

  // --- 初始化加载 (Load) ---

  useEffect(() => {
    try {
      // 1. 加载 Safe 列表
      const savedSafes = localStorage.getItem('zerostate_tracked_safes');
      if (savedSafes) setTrackedSafes(JSON.parse(savedSafes));

      // 2. 加载自定义链配置
      const savedChains = localStorage.getItem('zerostate_custom_chains');
      if (savedChains) {
         const customChainConfigs: ChainConfig[] = JSON.parse(savedChains);
         
         // 合并逻辑:
         // 1. 从 DEFAULT_CHAINS 开始
         // 2. 如果 LocalStorage 中有相同 ID 的配置，则视为"用户覆盖 (Override)"，使用 LocalStorage 的版本
         // 3. 如果 LocalStorage 中有新 ID，则视为"纯新增"，添加到列表
         
         const mergedChains = DEFAULT_CHAINS.map(defaultChain => {
            const override = customChainConfigs.find(c => c.id === defaultChain.id);
            // 这里我们特别注意保留 chainData 文件中的静态 explorers 列表
            // 用户覆盖的只是 defaultExplorerKey 和 defaultRpcUrl 等字段
            if (override) {
               return { 
                  ...defaultChain, 
                  ...override, 
                  // 强制使用最新的 explorers 列表，防止 storage 中存的旧数据覆盖了新加的 explorer
                  explorers: defaultChain.explorers, 
                  isCustom: true 
               };
            }
            return defaultChain;
         });

         // 添加纯新增的链 (DEFAULT 中不存在的)
         customChainConfigs.forEach(customChain => {
            if (!mergedChains.find(c => c.id === customChain.id)) {
               mergedChains.push(customChain);
            }
         });

         setChains(mergedChains);
      }

      // 3. 加载自定义 Token
      const savedTokens = localStorage.getItem('zerostate_custom_tokens');
      if (savedTokens) setCustomTokens(JSON.parse(savedTokens));

      // 4. 加载待处理交易
      const savedSafeTxs = localStorage.getItem('zerostate_pending_safe_txs');
      if (savedSafeTxs) setPendingSafeTxs(JSON.parse(savedSafeTxs));
    } catch (e) {
      console.warn("Failed to load persistence data (读取本地存储失败)", e);
    }
  }, []);

  // --- 变更保存 (Save) ---

  // 监听 trackedSafes 变更并保存
  useEffect(() => {
    localStorage.setItem('zerostate_tracked_safes', JSON.stringify(trackedSafes));
  }, [trackedSafes]);

  // 监听 chains 变更，保存所有被标记为 isCustom 的链 (包含被修改的默认链)
  useEffect(() => {
     // 过滤出有过修改或新增的链
     const chainsToSave = chains.filter(c => c.isCustom);
     localStorage.setItem('zerostate_custom_chains', JSON.stringify(chainsToSave));
  }, [chains]);

  // 监听 customTokens 变更并保存
  useEffect(() => {
     localStorage.setItem('zerostate_custom_tokens', JSON.stringify(customTokens));
  }, [customTokens]);

  // 监听 pendingSafeTxs 变更并保存
  useEffect(() => {
     localStorage.setItem('zerostate_pending_safe_txs', JSON.stringify(pendingSafeTxs));
  }, [pendingSafeTxs]);

  return {
    trackedSafes,
    setTrackedSafes,
    chains,
    setChains,
    customTokens,
    setCustomTokens,
    pendingSafeTxs,
    setPendingSafeTxs
  };
};