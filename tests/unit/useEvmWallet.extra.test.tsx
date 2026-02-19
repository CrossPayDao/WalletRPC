import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useEvmWallet } from '../../features/wallet/hooks/useEvmWallet';
import { useWalletStorage } from '../../features/wallet/hooks/useWalletStorage';
import { useWalletState } from '../../features/wallet/hooks/useWalletState';
import { useWalletData } from '../../features/wallet/hooks/useWalletData';
import { useTransactionManager } from '../../features/wallet/hooks/useTransactionManager';
import { useSafeManager } from '../../features/wallet/hooks/useSafeManager';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { TronService } from '../../services/tronService';
import { ethers } from 'ethers';

// Mock dependencies
vi.mock('../../features/wallet/hooks/useWalletStorage', () => ({ useWalletStorage: vi.fn() }));
vi.mock('../../features/wallet/hooks/useWalletState', () => ({ useWalletState: vi.fn() }));
vi.mock('../../features/wallet/hooks/useWalletData', () => ({ useWalletData: vi.fn() }));
vi.mock('../../features/wallet/hooks/useTransactionManager', () => ({ useTransactionManager: vi.fn() }));
vi.mock('../../features/wallet/hooks/useSafeManager', () => ({ useSafeManager: vi.fn() }));

const chainA = {
    id: 1,
    name: 'Ethereum',
    defaultRpcUrl: 'https://eth.rpc',
    chainType: 'EVM',
    tokens: [
        { address: '0xDefToken', symbol: 'DEF', decimals: 18 }
    ]
};

const setupMocks = (overrides: any = {}) => {
    const storageMock = {
        trackedSafes: [],
        setTrackedSafes: vi.fn(),
        chains: [chainA],
        setChains: vi.fn(),
        customTokens: {},
        setCustomTokens: vi.fn()
    };

    const stateMock = {
        wallet: { address: '0xUser' },
        activeAccountType: 'EOA',
        activeChainId: 1,
        activeSafeAddress: null,
        setActiveChainId: vi.fn(),
        setError: vi.fn(),
        setNotification: vi.fn(),
        view: overrides.view || 'dashboard',
        setIsLoading: vi.fn(),
        setIsAddTokenModalOpen: vi.fn(),
        tronWalletAddress: overrides.tronWalletAddress || null,
    };

    vi.mocked(useWalletStorage).mockReturnValue(storageMock as any);
    vi.mocked(useWalletState).mockReturnValue(stateMock as any);
    vi.mocked(useWalletData).mockReturnValue({
        fetchData: vi.fn(),
        safeDetails: null,
        isInitialFetchDone: true
    } as any);
    vi.mocked(useTransactionManager).mockReturnValue({
        addTransactionRecord: vi.fn()
    } as any);
    vi.mocked(useSafeManager).mockReturnValue({});

    return { stateMock, storageMock };
};

describe('useEvmWallet Extra Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('confirmAddToken should check for duplicates in activeChain.tokens (defaults)', async () => {
        const { stateMock } = setupMocks();
        const { result } = renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

        await act(async () => {
            // Check against default token defined in chainA
            await result.current.confirmAddToken('0xDefToken');
        });

        expect(stateMock.setError).toHaveBeenCalled(); // Should assume "Token already exists"
    });

    it('auto-detect failure (all probes fail) should remain on current chain', async () => {
        vi.useFakeTimers();
        const { stateMock } = setupMocks({ view: 'intro_animation', tronWalletAddress: 'TAddr' });

        // Mock all probes to fail or timeout
        vi.spyOn(TronService, 'getBalance').mockImplementation(async () => {
            await new Promise(r => setTimeout(r, 20000)); // Timeout
            return 0n;
        });
        vi.spyOn(ethers.JsonRpcProvider.prototype, 'getBalance').mockImplementation(async () => {
            throw new Error('rpc error');
        });

        renderHook(() => useEvmWallet(), { wrapper: LanguageProvider });

        // Advance enough for budget timeout (1500ms)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        expect(stateMock.setActiveChainId).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
