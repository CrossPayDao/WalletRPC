
import { useState } from 'react';
import { ethers } from 'ethers';
import { TronService } from '../../../services/tronService';
import { TokenConfig } from '../types';

/**
 * 【架构设计：原子化 UI 状态机】
 * 目的：管理钱包的非持久化即时状态。
 * 背景：处理私钥导入、视图切换（路由）和弹窗控制。
 * 协作：作为 useEvmWallet 的基础，为数据层 and 交易层提供 Wallet 实例。
 */
export const useWalletState = (initialChainId: number) => {
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
  const [errorObject, setErrorObject] = useState<any>(null);
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
  const handleImport = async (): Promise<boolean> => {
    setErrorObject(null);
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
      
      return true;
    } catch (e) {
      setErrorObject({ message: "Invalid Key/Mnemonic", timestamp: Date.now() });
      return false;
    }
  };

  const setError = (msg: string | null) => {
    setErrorObject(msg ? { message: msg, timestamp: Date.now() } : null);
  };

  return {
    wallet, setWallet, tronWalletAddress, tronPrivateKey,
    activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, view, setView,
    privateKeyOrPhrase, setPrivateKeyOrPhrase, isLoading, setIsLoading,
    error: errorObject?.message || null, errorObject, setError,
    notification, setNotification, handleImport,
    // 返回缺失的 UI 状态
    tokenToEdit, setTokenToEdit,
    isChainModalOpen, setIsChainModalOpen,
    isAddTokenModalOpen, setIsAddTokenModalOpen,
    isMenuOpen, setIsMenuOpen
  };
};