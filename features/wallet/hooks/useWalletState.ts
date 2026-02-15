
import { useState } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { TokenConfig } from '../types';
import { useTranslation } from '../../../contexts/LanguageContext';

/**
 * 【架构设计：原子化 UI 状态机】
 * 目的：管理钱包的非持久化即时状态。
 * 背景：处理私钥导入、视图切换（路由）和弹窗控制。
 * 协作：作为 useEvmWallet 的基础，为数据层 and 交易层提供 Wallet 实例。
 */
export const useWalletState = (initialChainId: number) => {
  const { t } = useTranslation();
  // 核心钱包实例 (仅内存存储，安全设计：刷新即销毁)
  const [wallet, setWallet] = useState<ethers.Wallet | ethers.HDNodeWallet | null>(null);
  const [tronWalletAddress, setTronWalletAddress] = useState<string | null>(null);
  const [tronPrivateKey, setTronPrivateKey] = useState<string | null>(null);

  // 账户与网络路由状态
  const [activeAccountType, setActiveAccountType] = useState<'EOA' | 'SAFE'>('EOA');
  const [activeSafeAddress, setActiveSafeAddress] = useState<string | null>(null);
  const [activeChainId, setActiveChainId] = useState<number>(initialChainId);

  // UI 表现层状态
  const [view, setView] = useState<'onboarding' | 'intro_animation' | 'dashboard' | 'send' | 'create_safe' | 'add_safe' | 'safe_queue' | 'settings'>('onboarding');
  const [privateKeyOrPhrase, setPrivateKeyOrPhrase] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const ERROR_DISPLAY_MS = 5000;
  // 去重冷却：同样错误在该窗口内重复触发，不重复“弹出”，只延长展示时长
  const ERROR_DEDUPE_COOLDOWN_MS = 1500;
  // 为避免错误提示“无限续命”导致用户无法操作，限制同一条错误最多展示 10 秒
  const ERROR_MAX_VISIBLE_MS = 10000;
  type WalletErrorObject = {
    message: string;
    shownAt: number;
    lastEventAt: number;
    expiresAt: number;
    count: number;
  };
  const [errorObject, setErrorObject] = useState<WalletErrorObject | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // UI 弹窗与交互状态
  const [tokenToEdit, setTokenToEdit] = useState<TokenConfig | null>(null);
  const [isChainModalOpen, setIsChainModalOpen] = useState(false);
  const [isAddTokenModalOpen, setIsAddTokenModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /**
   * 【性能与安全：异构链地址派生逻辑】
   * 为什么：Tron 和 EVM 虽使用相同的椭圆曲线，但标准派生路径不同。
   * 背景：
   * - EVM 标准: m/44'/60'/0'/0/0
   * - Tron 标准: m/44'/195'/0'/0/0
   * 解决：在 handleImport 中，如果检测到助记词，分别按两条路径派生，确保生成的地址与 TronLink/MetaMask 一致。
   */
  const setError = (msg: string | null) => {
    const now = Date.now();
    if (!msg) {
      setErrorObject(null);
      return;
    }
    setErrorObject((prev) => {
      // 只要同一条错误仍在展示期内，就不要重复“弹出”；仅续命并累计次数。
      // 额外保留一个小的冷却窗口，用于覆盖极端情况下的近同时触发。
      if (
        prev &&
        prev.message === msg &&
        (now < prev.expiresAt || now - prev.lastEventAt <= ERROR_DEDUPE_COOLDOWN_MS)
      ) {
        const maxExpiresAt = prev.shownAt + ERROR_MAX_VISIBLE_MS;
        return {
          ...prev,
          lastEventAt: now,
          expiresAt: Math.min(now + ERROR_DISPLAY_MS, maxExpiresAt),
          count: prev.count + 1
        };
      }
      return {
        message: msg,
        shownAt: now,
        lastEventAt: now,
        expiresAt: Math.min(now + ERROR_DISPLAY_MS, now + ERROR_MAX_VISIBLE_MS),
        count: 1
      };
    });
  };

  const handleImport = async (): Promise<boolean> => {
    setError(null);
    try {
      const input = privateKeyOrPhrase.trim();
      let newWallet: ethers.Wallet | ethers.HDNodeWallet;
      let newTronPK: string;

      if (input.includes(' ')) {
        // 助记词：多路径派生
        newWallet = ethers.Wallet.fromPhrase(input); // 默认 60'
        
        const mnemonic = ethers.Mnemonic.fromPhrase(input);
        const tronNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/195'/0'/0/0");
        newTronPK = tronNode.privateKey;
      } else {
        // 私钥：直接映射
        const pk = input.startsWith('0x') ? input : '0x' + input;
        newWallet = new ethers.Wallet(pk);
        newTronPK = pk;
      }
      
      const derivedTronAddr = TronService.addressFromPrivateKey(newTronPK);

      setWallet(newWallet);
      setTronPrivateKey(newTronPK);
      setTronWalletAddress(derivedTronAddr);
      setPrivateKeyOrPhrase('');
      
      return true;
    } catch (e) {
      setError(t('wallet.import_invalid'));
      return false;
    }
  };

  const clearSession = () => {
    setWallet(null);
    setTronWalletAddress(null);
    setTronPrivateKey(null);
    setActiveAccountType('EOA');
    setActiveSafeAddress(null);
    setPrivateKeyOrPhrase('');
    setIsLoading(false);
    setErrorObject(null);
    setNotification(null);
    setTokenToEdit(null);
    setIsChainModalOpen(false);
    setIsAddTokenModalOpen(false);
    setIsMenuOpen(false);
    setView('onboarding');
  };

  return {
    wallet, setWallet, tronWalletAddress, tronPrivateKey,
    activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, view, setView,
    privateKeyOrPhrase, setPrivateKeyOrPhrase, isLoading, setIsLoading,
    error: errorObject?.message || null, errorObject, setError,
    notification, setNotification, handleImport, clearSession,
    // 返回缺失的 UI 状态
    tokenToEdit, setTokenToEdit,
    isChainModalOpen, setIsChainModalOpen,
    isAddTokenModalOpen, setIsAddTokenModalOpen,
    isMenuOpen, setIsMenuOpen
  };
};
