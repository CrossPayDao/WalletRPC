
export interface TokenDefinition {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logo?: string;
}

export interface TokenConfig extends TokenDefinition {
  isCustom?: boolean;
}

export interface ExplorerConfig {
  name: string;
  key: string;
  url: string;
  txPath: string;
  addressPath: string;
}

export interface SafeContracts {
  proxyFactory: string;
  singleton: string;
  fallbackHandler: string;
}

export interface NetworkDefinition {
  id: number;
  name: string;
  defaultRpcUrl: string;
  publicRpcUrls: string[];
  currencySymbol: string;
  explorers: ExplorerConfig[];
  defaultExplorerKey?: string;
  isTestnet?: boolean;
  chainType?: 'EVM' | 'TRON';
  gasLimits?: {
    nativeTransfer: number;
    erc20Transfer: number;
    safeExec: number;
    safeSetup: number;
  };
  // 新增：按链定义的 Safe 合约配置
  safeContracts?: SafeContracts;
}

export interface ChainData extends NetworkDefinition {
  tokens: TokenDefinition[];
}

export interface ChainConfig extends NetworkDefinition {
  tokens: TokenConfig[];
  isCustom?: boolean;
}

export interface TrackedSafe {
  address: string;
  name: string;
  chainId: number;
}

export interface TransactionRecord {
  id: string;
  chainId: number;
  hash?: string;
  status: 'queued' | 'submitted' | 'confirmed' | 'failed';
  timestamp: number;
  summary: string;
  error?: string;
}

export interface SafePendingTx {
  id: string;
  to: string;
  value: string;
  data: string;
  nonce: number;
  safeTxHash: string;
  signatures: Record<string, string>;
  summary: string;
  executor?: string;
}

export interface SafeDetails {
  owners: string[];
  threshold: number;
  nonce: number;
}
