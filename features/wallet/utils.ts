

import { ChainConfig, ExplorerConfig } from "./types";

// Polyfill global for crypto libs
if (typeof window !== 'undefined' && !(window as any).global) {
  (window as any).global = window;
}

export const normalizeHex = (hex: string) => {
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return '0x' + hex;
};

export const getActiveExplorer = (chain: ChainConfig): ExplorerConfig | undefined => {
  if (!chain.explorers || chain.explorers.length === 0) return undefined;
  
  if (chain.defaultExplorerKey) {
    const found = chain.explorers.find(e => e.key === chain.defaultExplorerKey);
    if (found) return found;
  }
  
  return chain.explorers[0];
};

export const getExplorerLink = (chain: ChainConfig, hash: string) => {
  const explorer = getActiveExplorer(chain);
  if (!explorer || !explorer.txPath) return "#";
  return explorer.txPath.replace("{txid}", hash);
};

export const getExplorerAddressLink = (chain: ChainConfig, address: string) => {
  const explorer = getActiveExplorer(chain);
  if (!explorer || !explorer.addressPath) return "#";
  return explorer.addressPath.replace("{address}", address);
};

export const handleTxError = (e: any) => {
  console.error(e);
  if (typeof e === 'string') return e;
  
  const msg = e?.message || e?.error?.message || e?.reason || "";
  const code = e?.code || e?.error?.code;

  // Ethers specific codes
  if (code === 'INSUFFICIENT_FUNDS') return "Insufficient funds for gas + value. Please top up your wallet.";
  if (code === 'NUMERIC_FAULT') return "Invalid numeric value entered. Check amount and decimals.";
  if (code === 'NONCE_EXPIRED') return "Nonce expired or already used. Please refresh and try again.";
  if (code === 'REPLACEMENT_UNDERPRICED') return "Replacement transaction underpriced. Increase gas price.";
  if (code === 'ACTION_REJECTED') return "Transaction rejected by user.";
  if (code === 'CALL_EXCEPTION') return "Transaction reverted on-chain. Check contract logic, token balance, or allowance.";
  if (code === 'UNPREDICTABLE_GAS_LIMIT') return "Cannot estimate gas. Transaction may fail on-chain.";

  // RPC strings common in Geth/Parity
  if (msg.includes('insufficient funds')) return "Insufficient funds for transaction.";
  if (msg.includes('gas limit')) return "Gas limit too low.";
  if (msg.includes('nonce too low')) return "Nonce too low. Resetting sync...";
  if (msg.includes('already known') || code === -32000) return "Transaction already known (in mempool).";
  if (msg.includes('execution reverted')) return "Execution reverted. " + (e.reason ? `Reason: ${e.reason}` : "");

  // Safe specific
  if (msg.includes('GS013')) return "Safe Transaction Failed (GS013). Check Safe funds or gas limits.";
  if (msg.includes('GS026')) return "Invalid Safe Signature/Owners (GS026).";
  
  // Default fallback with truncation
  if (msg.length > 150) return msg.slice(0, 150) + "...";
  return msg || "Transaction failed";
};