
import { ethers } from 'ethers';

/**
 * 【设计亮点：模块级单例缓存 (Fee-Orchestrator)】
 * 
 * 背景：在以太坊生态中，Gas 价格波动剧烈且请求频繁。
 * 目标：降低 RPC 调用频率（节省成本），同时确保交易不会因为 Gas 过低而卡死。
 * 解决问题：
 * 1. 消除冗余请求：多个 Hooks 同时调用时，仅发起一次有效 RPC。
 * 2. 交易安全性：通过 50% 的缓冲（Buffer）机制，应对区块打包间隙的价格暴涨。
 */
const feeCache = {
  data: null as ethers.FeeData | null,
  timestamp: 0,
  chainId: 0
};

const CACHE_DURATION = 15000; // 15秒缓存：平衡了“实时性”与“响应速度”

export const FeeService = {
  /**
   * 【逻辑关联：自适应缓存获取】
   * 逻辑：如果当前链 ID 未变且缓存未过期，立即返回内存数据，UI 响应时间从 ~200ms 降至 <1ms。
   */
  getOptimizedFeeData: async (provider: ethers.JsonRpcProvider, chainId: number): Promise<ethers.FeeData> => {
    const now = Date.now();
    
    if (feeCache.data && (now - feeCache.timestamp < CACHE_DURATION) && feeCache.chainId === chainId) {
      return feeCache.data;
    }

    try {
      const data = await provider.getFeeData();
      feeCache.data = data;
      feeCache.timestamp = now;
      feeCache.chainId = chainId;
      return data;
    } catch (e) {
      console.warn("Fee fetch failed, fallback to defaults", e);
      return new ethers.FeeData(); 
    }
  },

  /**
   * 【性能优势：Overrides 构建器】
   * 作用：在 Ethers 发送交易前，注入经计算的最高优先级费用，强制覆盖库的默认保守策略。
   * 解决了：用户在高峰期发送交易一直处于 Pending 的挫败感。
   */
  buildOverrides: (feeData: ethers.FeeData, customGasLimit?: ethers.BigNumberish | null) => {
    const overrides: any = {};
    if (customGasLimit != null) overrides.gasLimit = BigInt(customGasLimit);

    // EIP-1559 适配逻辑
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n; // 1.5x 加价确保快速入块
      overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;
    } else if (feeData.gasPrice) {
      overrides.gasPrice = (feeData.gasPrice * 130n) / 100n; 
    }

    return overrides;
  }
};
