
import { ethers } from 'ethers';

/**
 * Global Fee Cache
 * 存放在模块作用域，确保所有导入此模块的 Hooks 共享同一份缓存。
 */
const feeCache = {
  data: null as ethers.FeeData | null,
  timestamp: 0,
  chainId: 0
};

const CACHE_DURATION = 15000; // 15秒缓存期

export const FeeService = {
  /**
   * 获取优化的费用数据
   */
  getOptimizedFeeData: async (provider: ethers.JsonRpcProvider, chainId: number): Promise<ethers.FeeData> => {
    const now = Date.now();
    
    // 如果缓存有效且 ChainID 匹配，直接返回
    if (feeCache.data && (now - feeCache.timestamp < CACHE_DURATION) && feeCache.chainId === chainId) {
      return feeCache.data;
    }

    // 否则发起 RPC 请求
    try {
      const data = await provider.getFeeData();
      feeCache.data = data;
      feeCache.timestamp = now;
      feeCache.chainId = chainId;
      return data;
    } catch (e) {
      console.warn("Fee fetch failed, using fallback/empty data", e);
      return new ethers.FeeData();
    }
  },

  /**
   * 构建完整的 Transaction Overrides
   * 必须包含完整的费用字段，否则 Ethers 会触发自动补全请求。
   * Fix: Updated signature to accept ethers.BigNumberish | null to accommodate gasLimit types from standard TransactionRequests.
   */
  buildOverrides: (feeData: ethers.FeeData, customGasLimit?: ethers.BigNumberish | null) => {
    const overrides: any = {};
    
    // Ensure gasLimit is converted to bigint if it exists (including strings from BigNumberish)
    if (customGasLimit != null) {
      overrides.gasLimit = BigInt(customGasLimit);
    }

    // 优先使用 EIP-1559 (if supported by network)
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n;
      overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;
      // 注意：一旦提供了 maxFeePerGas，就不要提供 gasPrice，否则会报错
    } else if (feeData.gasPrice) {
      overrides.gasPrice = (feeData.gasPrice * 130n) / 100n;
    }

    return overrides;
  }
};
