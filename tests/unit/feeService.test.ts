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
});
