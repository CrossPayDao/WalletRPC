

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
  txPath: string;      // Pattern: https://.../tx/{txid}
  addressPath: string; // Pattern: https://.../address/{address}
}

export interface NetworkDefinition {
  id: number;
  name: string;
  defaultRpcUrl: string;
  publicRpcUrls: string[];
  currencySymbol: string;
  explorers: ExplorerConfig[]; // Changed from single explorer object to array
  defaultExplorerKey?: string; // User's selected explorer key
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
  chainId: number; // Added to track which network this tx belongs to
  hash?: string;
  status: 'queued' | 'submitted' | 'confirmed' | 'failed';
  timestamp: number;
  summary: string;
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