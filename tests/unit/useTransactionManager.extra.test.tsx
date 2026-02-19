import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../features/wallet/types';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';
import { FeeService } from '../../services/feeService';

// Mock FeeService
vi.mock('../../services/feeService', () => ({
    FeeService: {
        getOptimizedFeeData: vi.fn(),
        buildOverrides: vi.fn(() => ({}))
    }
}));

// Mock LanguageProvider to force key return
vi.mock('../../contexts/LanguageContext', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
    LanguageProvider: ({ children }: any) => children
}));

const evmChain: ChainConfig = {
    id: 199,
    name: 'BitTorrent Chain',
    defaultRpcUrl: 'https://rpc.bittorrentchain.io',
    publicRpcUrls: ['https://rpc.bittorrentchain.io'],
    currencySymbol: 'BTT',
    chainType: 'EVM',
    explorers: [],
    tokens: []
};

describe('useTransactionManager Extra Coverage', () => {

    it('should apply backoff strategy (5s -> 15s -> 30s) for subsequent polls', async () => {
        vi.useFakeTimers();
        const getTransactionReceipt = vi.fn().mockResolvedValue(null); // Always pending
        const provider = { getTransactionReceipt } as any;

        const { result } = renderHook(() =>
            useTransactionManager({
                wallet: null,
                tronPrivateKey: null,
                provider,
                activeChain: evmChain,
                activeChainId: 199,
                activeAccountType: 'EOA',
                fetchData: vi.fn(),
                setError: vi.fn(),
                handleSafeProposal: vi.fn()
            })
            , { wrapper: LanguageProvider });

        // Add a pending transaction
        act(() => {
            result.current.addTransactionRecord({
                id: 'tx-backoff', chainId: 199, hash: '0x123', status: 'submitted', timestamp: Date.now(), summary: 'test'
            });
        });

        // 1st Poll: 5000ms
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getTransactionReceipt).toHaveBeenCalledTimes(1);

        // Attempts = 1 (delay 5s)
        // Next poll at +5000.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getTransactionReceipt).toHaveBeenCalledTimes(2);

        // Fast forward to attempts >= 6 (should switch to 15s)
        // 2 (5s), 3 (5s), 4 (5s), 5 (5s), 6 (5s) -> Next is 15s.
        for (let i = 0; i < 4; i++) {
            await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        }
        expect(getTransactionReceipt).toHaveBeenCalledTimes(6);

        // Now attempts = 6. Next delay should be 15s.
        // Advance 5s -> should NOT confirm
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(getTransactionReceipt).toHaveBeenCalledTimes(6); // Still 6

        // Advance 10s more (total 15s) -> should confirm
        await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
        expect(getTransactionReceipt).toHaveBeenCalledTimes(7);

        vi.useRealTimers();
    });

    it('should clip long TRON broadcast error details', async () => {
        const setError = vi.fn();
        const tronChain: ChainConfig = { ...evmChain, chainType: 'TRON' };
        const longError = 'E'.repeat(200);

        vi.spyOn(TronService, 'sendTransaction').mockResolvedValue({
            success: false,
            error: longError
        });

        const { result } = renderHook(() =>
            useTransactionManager({
                wallet: { address: 'TAddr' } as any,
                tronPrivateKey: 'Key',
                provider: null,
                activeChain: tronChain,
                activeChainId: 199,
                activeAccountType: 'EOA',
                fetchData: vi.fn(),
                setError,
                handleSafeProposal: vi.fn()
            })
            , { wrapper: LanguageProvider });

        await act(async () => {
            await result.current.handleSendSubmit({
                recipient: 'TRecipient',
                amount: '10',
                asset: 'NATIVE'
            });
        });

        expect(setError).toHaveBeenCalled();
        const errorMsg = setError.mock.calls[0][0];
        expect(errorMsg).toContain(longError.slice(0, 120));
        expect(errorMsg).toContain('...');
        expect(errorMsg.length).toBeLessThan(longError.length); // It is clipped + context
    });

    it('should handle wallet_provider_not_ready error mapping', async () => {
        const setError = vi.fn();
        const { result } = renderHook(() =>
            useTransactionManager({
                wallet: null, // trigger error
                tronPrivateKey: null,
                provider: null,
                activeChain: evmChain,
                activeChainId: 199,
                activeAccountType: 'EOA',
                fetchData: vi.fn(),
                setError,
                handleSafeProposal: vi.fn()
            })
            , { wrapper: LanguageProvider });

        await act(async () => {
            await result.current.handleSendSubmit({
                recipient: '0xRecipient', amount: '1', asset: 'NATIVE'
            });
        });

        expect(setError).toHaveBeenCalledWith('tx.err_wallet_provider_not_ready');
    });
});
