import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeduplicatingJsonRpcProvider } from '../../features/wallet/hooks/useEvmWallet';
import { ethers } from 'ethers';

describe('DeduplicatingJsonRpcProvider Coverage', () => {
    let provider: DeduplicatingJsonRpcProvider;
    let mockSend: any;

    beforeEach(() => {
        vi.useFakeTimers();
        // Spy on the real JsonRpcProvider.prototype.send
        mockSend = vi.spyOn(ethers.JsonRpcProvider.prototype, 'send').mockResolvedValue('0xResult');
        provider = new DeduplicatingJsonRpcProvider('http://localhost', ethers.Network.from(1));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should cache cacheable methods (eth_gasPrice) for 2 seconds', async () => {
        // 1. First call
        const p1 = provider.send('eth_gasPrice', []);

        // 2. Immediate second call (deduplication in flight)
        const p2 = provider.send('eth_gasPrice', []);

        await expect(p1).resolves.toBe('0xResult');
        await expect(p2).resolves.toBe('0xResult');

        // Only one network request
        expect(mockSend).toHaveBeenCalledTimes(1);

        // 3. Call after resolved but within cache TTL (100ms later)
        await vi.advanceTimersByTimeAsync(100);
        const p3 = await provider.send('eth_gasPrice', []);
        expect(p3).toBe('0xResult');
        expect(mockSend).toHaveBeenCalledTimes(1); // Still cached

        // 4. Call after cache expiry (2001ms later)
        await vi.advanceTimersByTimeAsync(2000); // Wait > 2000ms

        // Force new result
        mockSend.mockResolvedValueOnce('0xNewResult');
        const p4 = await provider.send('eth_gasPrice', []);

        expect(p4).toBe('0xNewResult');
        expect(mockSend).toHaveBeenCalledTimes(2); // New request
    });

    it('should deduplicate inflight requests for inflight-only methods (eth_getBalance)', async () => {
        // Simulate slow network
        let resolveRequest: (val: any) => void = () => { };
        mockSend.mockImplementation(() => new Promise(r => resolveRequest = r));

        const p1 = provider.send('eth_getBalance', ['0xAddr', 'latest']);
        const p2 = provider.send('eth_getBalance', ['0xAddr', 'latest']);

        // Only 1 inflight
        expect(mockSend).toHaveBeenCalledTimes(1);

        resolveRequest('0x100');
        await expect(p1).resolves.toBe('0x100');
        await expect(p2).resolves.toBe('0x100');

        // Verify NO cache persistence for this method
        await vi.advanceTimersByTimeAsync(100);
        mockSend.mockResolvedValue('0x200'); // New immediate result

        const p3 = await provider.send('eth_getBalance', ['0xAddr', 'latest']);
        expect(p3).toBe('0x200');
        expect(mockSend).toHaveBeenCalledTimes(2); // New request
    });

    it('should cleanup cache when size limit exceeded', async () => {
        // Fill cache with distinct keys
        for (let i = 0; i < 205; i++) {
            mockSend.mockResolvedValue(`0x${i}`);
            await provider.send('eth_gasPrice', [i]); // different params -> different key
        }

        // MAX_CACHE_SIZE is 200.
        // The first few should be evicted.

        // Reset mock counting
        mockSend.mockClear();
        mockSend.mockResolvedValue('0xRefetched');

        // Request key 0 again (should be evicted)
        const resOld = await provider.send('eth_gasPrice', [0]);
        expect(resOld).toBe('0xRefetched');
        expect(mockSend).toHaveBeenCalledTimes(1); // Call made

        // Request key 204 again (should be cached)
        const resRecent = await provider.send('eth_gasPrice', [204]);
        expect(resRecent).toBe('0x204');
        expect(mockSend).toHaveBeenCalledTimes(1); // No new call
    });

    it('should bypass cache for non-target methods', async () => {
        await provider.send('eth_call', [{ to: '0x' }, 'latest']);
        await provider.send('eth_call', [{ to: '0x' }, 'latest']);

        expect(mockSend).toHaveBeenCalledTimes(2);
    });
});
