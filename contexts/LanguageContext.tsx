
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    "wallet.title": "Wallet RPC",
    "wallet.intro": "High-performance RPC Wallet",
    "wallet.beta": "BETA",
    "wallet.experimental_build": "EXPERIMENTAL BUILD",
    "wallet.disclaimer": "Experimental platform. Use at your own risk. Not for production.",
    "wallet.connect_title": "Initialize Key",
    "wallet.connect_desc": "Secure local decryption of your private keys and mnemonic phrases.",
    "safe.title": "Multisig Control",
    "safe.connect": "Connect Safe",
    "safe.address": "Safe Address",
    "safe.error_empty": "Please enter a contract address.",
    "safe.error_prefix": "Invalid format: Address must start with '0x'.",
    "safe.error_length": "Invalid length: Expected 42 characters.",
    "safe.error_format": "Invalid characters: Address must be a valid hex string.",
    "safe.error_not_contract": "Invalid address: Target is not a contract on this network.",
    "tx.error_empty_addr": "Recipient address is required.",
    "tx.error_evm_prefix": "EVM addresses must start with '0x'.",
    "tx.error_evm_length": "EVM addresses must be 42 characters.",
    "tx.error_tron_prefix": "Tron addresses must start with 'T' or '0x41'.",
    "tx.error_tron_length": "Invalid Tron address length.",
    "tx.error_invalid_format": "Invalid address format or checksum failed.",
  },
  zh: {
    "wallet.title": "Wallet RPC",
    "wallet.intro": "高性能 RPC 钱包",
    "wallet.beta": "BETA",
    "wallet.experimental_build": "实验性构建",
    "wallet.disclaimer": "实验性测试平台，请自行承担使用风险，非生产级应用。",
    "wallet.connect_title": "初始化密钥",
    "wallet.connect_desc": "在本地安全地解密您的私钥和助记词。",
    "safe.title": "多签管理",
    "safe.connect": "连接 Safe",
    "safe.address": "Safe 地址",
    "safe.error_empty": "请输入合约地址。",
    "safe.error_prefix": "格式错误：地址必须以 '0x' 开头。",
    "safe.error_length": "长度错误：EVM 地址应为 42 位字符。",
    "safe.error_format": "格式错误：地址包含非法字符。",
    "safe.error_not_contract": "验证失败：此地址在当前网络不是有效的合约。",
    "tx.error_empty_addr": "请输入接收地址。",
    "tx.error_evm_prefix": "EVM 地址必须以 '0x' 开头。",
    "tx.error_evm_length": "EVM 地址长度应为 42 位字符。",
    "tx.error_tron_prefix": "Tron 地址必须以 'T' 或 '0x41' 开头。",
    "tx.error_tron_length": "Tron 地址长度错误 (Base58 为 34 位, Hex 为 44 位)。",
    "tx.error_invalid_format": "地址格式无效或校验和错误。",
  }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('nexus_lang') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'zh')) {
      setLanguage(savedLang);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('nexus_lang', lang);
  };

  const t = (key: string) => {
    return TRANSLATIONS[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
};
