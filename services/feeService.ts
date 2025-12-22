
import { ethers } from 'ethers';

/**
 * 【架构设计：模块级单例缓存】
 * 背景：在 React 中，不同组件使用的 Hooks 相互隔离。若各 Hook 独立获取费用，会导致重复的 eth_gasPrice 请求。
 * 解决：将缓存置于函数外部（模块作用域），实现真正的全局数据共享。
 * 优势：极大地减少了 RPC 调用频率，节省节点流量额度。
 */
const feeCache = {
  data: null as ethers.FeeData | null,
  timestamp: 0,
  chainId: 0
};

const CACHE_DURATION = 15000; // 15秒缓存期：平衡实时性与性能

export const FeeService = {
  /**
   * 【逻辑：优化获取费用数据】
   * 目的：确保在短时间内多次调用时，只发起一次网络请求。
   */
  getOptimizedFeeData: async (provider: ethers.JsonRpcProvider, chainId: number): Promise<ethers.FeeData> => {
    const now = Date.now();
    
    // 逻辑判定：时间有效且链 ID 匹配则命中缓存
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
      console.warn("Fee fetch failed", e);
      return new ethers.FeeData(); // 失败回退，保证后续逻辑不崩溃
    }
  },

  /**
   * 【性能关键：穷尽式 Overrides 构建】
   * 目的：阻止 Ethers.js 的自动补全行为。
   * 背景：Ethers.js 如果发现缺参数（如缺 maxFeePerGas），会在 sendTransaction 前自发请求补全。
   * 好处：一次性注入所有参数，强制关闭 Ethers.js 的二次查询，实现“所见即所得”的交易发送。
   */
  buildOverrides: (feeData: ethers.FeeData, customGasLimit?: ethers.BigNumberish | null) => {
    const overrides: any = {};
    
    if (customGasLimit != null) {
      overrides.gasLimit = BigInt(customGasLimit);
    }

    // 适配 EIP-1559 现代网络协议
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n; // 50% 缓冲应对波动
      overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;
    } else if (feeData.gasPrice) {
      overrides.gasPrice = (feeData.gasPrice * 130n) / 100n; // 传统网络加价逻辑
    }

    return overrides;
  }
};
