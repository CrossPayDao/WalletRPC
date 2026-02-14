import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ethers } from 'ethers';
import { useWalletState } from '../../features/wallet/hooks/useWalletState';
import { TronService } from '../../services/tronService';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

describe('useWalletState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('支持助记词导入并派生 EVM 与 TRON 账户信息', async () => {
    const mockedEvmWallet = new ethers.Wallet(`0x${'11'.repeat(32)}`);
    vi.spyOn(ethers.Wallet, 'fromPhrase').mockReturnValue(mockedEvmWallet as any);
    vi.spyOn(ethers.Mnemonic, 'fromPhrase').mockReturnValue({} as any);
    vi.spyOn(ethers.HDNodeWallet, 'fromMnemonic').mockReturnValue({
      privateKey: `0x${'22'.repeat(32)}`
    } as any);
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(`T${'1'.repeat(33)}`);
    const { result } = renderHook(() => useWalletState(199));

    act(() => {
      result.current.setPrivateKeyOrPhrase(TEST_MNEMONIC);
    });
    await waitFor(() => {
      expect(result.current.privateKeyOrPhrase).toBe(TEST_MNEMONIC);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleImport();
    });

    expect(success).toBe(true);
    expect(result.current.wallet?.address).toBe(mockedEvmWallet.address);
    expect(result.current.tronPrivateKey).toBe(`0x${'22'.repeat(32)}`);
    expect(result.current.tronWalletAddress?.startsWith('T')).toBe(true);
    expect(result.current.tronWalletAddress?.length).toBe(34);
    expect(result.current.privateKeyOrPhrase).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('支持无 0x 前缀私钥导入', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(`T${'2'.repeat(33)}`);
    const privateKeyNoPrefix = '59c6995e998f97a5a0044966f0945382d7f9e9955f5d5f8d6f2ad4d9c7cb4d95';
    const { result } = renderHook(() => useWalletState(1));

    act(() => {
      result.current.setPrivateKeyOrPhrase(privateKeyNoPrefix);
    });
    await waitFor(() => {
      expect(result.current.privateKeyOrPhrase).toBe(privateKeyNoPrefix);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleImport();
    });

    expect(success).toBe(true);
    expect(result.current.wallet?.address).toBe(new ethers.Wallet(`0x${privateKeyNoPrefix}`).address);
    expect(result.current.tronPrivateKey).toBe(`0x${privateKeyNoPrefix}`);
    expect(result.current.privateKeyOrPhrase).toBe('');
  });

  it('非法输入会返回错误并设置统一报错信息', async () => {
    const { result } = renderHook(() => useWalletState(1));

    act(() => {
      result.current.setPrivateKeyOrPhrase('invalid mnemonic');
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleImport();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe('Invalid Key/Mnemonic');
  });

  it('clearSession 会清空会话敏感状态并重置视图', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(`T${'3'.repeat(33)}`);
    const privateKeyNoPrefix = '59c6995e998f97a5a0044966f0945382d7f9e9955f5d5f8d6f2ad4d9c7cb4d95';
    const { result } = renderHook(() => useWalletState(1));

    act(() => {
      result.current.setPrivateKeyOrPhrase(privateKeyNoPrefix);
      result.current.setActiveAccountType('SAFE');
      result.current.setActiveSafeAddress('0x000000000000000000000000000000000000dEaD');
      result.current.setView('send');
    });

    await act(async () => {
      await result.current.handleImport();
    });

    expect(result.current.wallet).not.toBeNull();
    expect(result.current.tronPrivateKey).toBeTruthy();
    expect(result.current.activeAccountType).toBe('SAFE');
    expect(result.current.view).toBe('send');

    act(() => {
      result.current.clearSession();
    });

    expect(result.current.wallet).toBeNull();
    expect(result.current.tronPrivateKey).toBeNull();
    expect(result.current.tronWalletAddress).toBeNull();
    expect(result.current.privateKeyOrPhrase).toBe('');
    expect(result.current.activeAccountType).toBe('EOA');
    expect(result.current.activeSafeAddress).toBeNull();
    expect(result.current.view).toBe('onboarding');
  });
});
