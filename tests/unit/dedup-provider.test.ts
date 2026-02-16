import { describe, expect, it, vi, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { DeduplicatingJsonRpcProvider } from '../../features/wallet/hooks/useEvmWallet';

describe('DeduplicatingJsonRpcProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const build = () => {
    const network = ethers.Network.from(1);
    return new DeduplicatingJsonRpcProvider('https://eth.llamarpc.com', network, { staticNetwork: network });
  };

  it('非缓存方法应每次透传到底层 send', async () => {
    const spy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, 'send')
      .mockResolvedValue('ok' as any);
    const p = build();

    await p.send('eth_getLogs', []);
    await p.send('eth_getLogs', []);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('可缓存方法在 TTL 内应命中结果缓存', async () => {
    const spy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, 'send')
      .mockResolvedValueOnce('v1' as any)
      .mockResolvedValueOnce('v2' as any);
    const p = build();

    const a = await p.send('eth_gasPrice', []);
    const b = await p.send('eth_gasPrice', []);

    expect(a).toBe('v1');
    expect(b).toBe('v1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('并发相同请求应只触发一次底层调用', async () => {
    let resolve: (v: unknown) => void = () => {};
    const pending = new Promise((r) => {
      resolve = r;
    });
    const spy = vi.spyOn(ethers.JsonRpcProvider.prototype, 'send').mockImplementation(() => pending as any);
    const p = build();

    const p1 = p.send('eth_getBalance', ['0x1', 'latest']);
    const p2 = p.send('eth_getBalance', ['0x1', 'latest']);
    resolve('same');

    await expect(Promise.all([p1, p2])).resolves.toEqual(['same', 'same']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('缓存过期后应重新请求并触发清理逻辑', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, 'send')
      .mockResolvedValueOnce('old' as any)
      .mockResolvedValueOnce('new' as any);
    const p = build();

    await expect(p.send('eth_feeHistory', [1, 'latest', []])).resolves.toBe('old');
    await vi.advanceTimersByTimeAsync(2100);
    await expect(p.send('eth_feeHistory', [1, 'latest', []])).resolves.toBe('new');

    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
