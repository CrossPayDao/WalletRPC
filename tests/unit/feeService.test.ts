import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { FeeService } from '../../services/feeService';

describe('FeeService', () => {
  it('同一个 provider+chain 并发请求会去重', async () => {
    const feeData = new ethers.FeeData(100n, 200n, 10n);
    const provider = {
      getFeeData: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return feeData;
      })
    } as unknown as ethers.JsonRpcProvider;

    const [a, b] = await Promise.all([
      FeeService.getOptimizedFeeData(provider, 1),
      FeeService.getOptimizedFeeData(provider, 1)
    ]);

    expect(provider.getFeeData).toHaveBeenCalledTimes(1);
    expect(a).toBe(feeData);
    expect(b).toBe(feeData);
  });

  it('不同 provider 实例不会互相串缓存', async () => {
    const p1 = { getFeeData: vi.fn(async () => new ethers.FeeData(1n, 2n, 3n)) } as unknown as ethers.JsonRpcProvider;
    const p2 = { getFeeData: vi.fn(async () => new ethers.FeeData(4n, 5n, 6n)) } as unknown as ethers.JsonRpcProvider;

    const a = await FeeService.getOptimizedFeeData(p1, 1);
    const b = await FeeService.getOptimizedFeeData(p2, 1);

    expect(p1.getFeeData).toHaveBeenCalledTimes(1);
    expect(p2.getFeeData).toHaveBeenCalledTimes(1);
    expect(a.gasPrice).toBe(1n);
    expect(b.gasPrice).toBe(4n);
  });

  it('getFeeData 异常时返回默认 FeeData', async () => {
    const provider = {
      getFeeData: vi.fn(async () => {
        throw new Error('rpc down');
      })
    } as unknown as ethers.JsonRpcProvider;

    const result = await FeeService.getOptimizedFeeData(provider, 9999);
    expect(result.gasPrice).toBeNull();
    expect(result.maxFeePerGas).toBeNull();
    expect(result.maxPriorityFeePerGas).toBeNull();
  });

  it('buildOverrides 优先使用 EIP-1559 并放大 fee', () => {
    const feeData = new ethers.FeeData(10n, 200n, 50n);
    const overrides = FeeService.buildOverrides(feeData, 21000n);

    expect(overrides.gasLimit).toBe(21000n);
    expect(overrides.maxFeePerGas).toBe(300n);
    expect(overrides.maxPriorityFeePerGas).toBe(60n);
    expect(overrides.gasPrice).toBeUndefined();
  });

  it('buildOverrides 在 legacy gasPrice 下回退并放大', () => {
    const feeData = new ethers.FeeData(100n, null, null);
    const overrides = FeeService.buildOverrides(feeData);

    expect(overrides.gasPrice).toBe(130n);
    expect(overrides.maxFeePerGas).toBeUndefined();
    expect(overrides.maxPriorityFeePerGas).toBeUndefined();
  });
});
