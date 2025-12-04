
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

export interface NetworkDefinition {
  id: number;
  name: string;
  defaultRpcUrl: string;
  currencySymbol: string;
  explorerUrl: string;
  isTestnet?: boolean;
  chainType?: 'EVM' | 'TRON';
}

/**
 * Represents a single file in the data/chains directory.
 * Contains network configuration and default token list.
 */
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
  hash?: string;
  status: 'queued' | 'submitted' | 'confirmed' | 'failed';
  timestamp: number;
  summary: string;
  explorerUrl: string;
  error?: string;
}

export interface SafePendingTx {
  id: string; // timestamp
  to: string;
  value: string;
  data: string;
  nonce: number;
  safeTxHash: string;
  signatures: Record<string, string>; // owner -> signature
  summary: string;
  executor?: string;
}

export interface SafeContracts {
  proxyFactory: string;
  singleton: string;
  fallbackHandler: string;
}

export interface SafeDetails {
  owners: string[];
  threshold: number;
  nonce: number;
}
