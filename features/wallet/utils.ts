

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

export const handleTxError = (e: any, t?: (key: string) => string) => {
  console.error(e);
  if (typeof e === 'string') return e;

  const primaryMsg: string = String(e?.shortMessage || e?.message || '');
  let msgRaw: string = primaryMsg;
  // ethers v6 经常把底层 JSON-RPC 错误包成 "could not coalesce error"
  // 这种情况下优先展示更有意义的底层 message。
  if (!msgRaw || msgRaw.toLowerCase().includes('could not coalesce error')) {
    const secondaryMsg: string = String(e?.error?.message || e?.info?.error?.message || e?.reason || '');
    if (secondaryMsg) msgRaw = secondaryMsg;
  }
  const msg = msgRaw.toLowerCase();
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code ?? e?.info?.statusCode ?? e?.status ?? e?.response?.status;
  const jsonRpcCode = e?.error?.code ?? e?.info?.error?.code;
  const httpStatus = typeof code === 'number' && code >= 100 && code < 600 ? code : (typeof e?.statusCode === 'number' ? e.statusCode : undefined);

  const has = (needle: string) => msg.includes(needle.toLowerCase());
  const reason = typeof e?.reason === 'string' ? e.reason : '';
  const hasReason = reason && reason !== msgRaw;

  // Ethers specific codes
  if (code === 'INSUFFICIENT_FUNDS') return t ? t('tx.err_insufficient_funds') : "Insufficient funds for gas + value. Please top up your wallet.";
  if (code === 'NUMERIC_FAULT') return t ? t('tx.err_numeric_fault') : "Invalid numeric value entered. Check amount and decimals.";
  if (code === 'NONCE_EXPIRED') return t ? t('tx.err_nonce_expired') : "Nonce expired or already used. Please refresh and try again.";
  if (code === 'REPLACEMENT_UNDERPRICED') return t ? t('tx.err_replacement_underpriced') : "Replacement transaction underpriced. Increase gas price.";
  if (code === 'ACTION_REJECTED') return t ? t('tx.err_action_rejected') : "Transaction rejected by user.";
  if (code === 'CALL_EXCEPTION') return t ? t('tx.err_call_exception') : "Transaction reverted on-chain. Check contract logic, token balance, or allowance.";
  if (code === 'UNPREDICTABLE_GAS_LIMIT') return t ? t('tx.err_unpredictable_gas') : "Cannot estimate gas. Transaction may fail on-chain.";

  // Network / fetch / browser-layer failures
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || has('timeout') || has('timed out')) return t ? t('tx.err_timeout') : 'Request timed out.';
  if (has('failed to fetch') || has('networkerror') || has('network error') || has('load failed')) return t ? t('tx.err_network_error') : 'Network error.';
  if (has('cors') || has('access-control-allow-origin')) return t ? t('tx.err_rpc_cors') : 'CORS blocked by RPC endpoint.';
  if (has('err_connection_refused') || has('connection refused') || has('econnrefused')) return t ? t('tx.err_rpc_connection_refused') : 'Connection refused.';
  if (has('could not resolve host') || has('enotfound') || has('name not resolved') || has('dns')) return t ? t('tx.err_rpc_dns') : 'DNS resolution failed.';
  if (has('too many requests') || has('rate limit') || httpStatus === 429) return t ? t('tx.err_rpc_rate_limited') : 'Rate limited.';

  // HTTP status from RPC gateway/proxy
  if (httpStatus) {
    if (httpStatus === 401) return t ? t('tx.err_rpc_unauthorized') : 'Unauthorized.';
    if (httpStatus === 403) return t ? t('tx.err_rpc_forbidden') : 'Forbidden.';
    if (httpStatus === 404) return t ? t('tx.err_rpc_not_found') : 'Not found.';
    if (httpStatus === 502) return t ? t('tx.err_rpc_bad_gateway') : 'Bad gateway.';
    if (httpStatus === 503) return t ? t('tx.err_rpc_service_unavailable') : 'Service unavailable.';
    if (httpStatus === 504) return t ? t('tx.err_rpc_gateway_timeout') : 'Gateway timeout.';
    return (t ? t('tx.err_rpc_http_status') : 'RPC HTTP error') + ` ${httpStatus}`;
  }

  // JSON-RPC error codes (per spec / common clients)
  if (jsonRpcCode === -32700) return t ? t('tx.err_rpc_parse_error') : 'RPC parse error.';
  if (jsonRpcCode === -32600) return t ? t('tx.err_rpc_invalid_request') : 'RPC invalid request.';
  if (jsonRpcCode === -32601 || has('method not found')) return t ? t('tx.err_rpc_method_not_found') : 'RPC method not found.';
  if (jsonRpcCode === -32602 || has('invalid params')) return t ? t('tx.err_rpc_invalid_params') : 'Invalid params.';
  if (jsonRpcCode === -32603 || has('internal error')) return t ? t('tx.err_rpc_internal_error') : 'RPC internal error.';
  if (jsonRpcCode === -32005 || jsonRpcCode === -32016) return t ? t('tx.err_rpc_rate_limited') : 'Rate limited.';

  // Safe specific
  if (has('gs013')) return t ? t('tx.err_safe_gs013') : "Safe Transaction Failed (GS013). Check Safe funds or gas limits.";
  if (has('gs026')) return t ? t('tx.err_safe_gs026') : "Invalid Safe Signature/Owners (GS026).";

  // Gas / fee / nonce / underpriced patterns
  if (has('replacement transaction underpriced') || has('underpriced')) return t ? t('tx.err_tx_underpriced') : 'Transaction underpriced.';
  if (has('max fee per gas less than block base fee') || has('fee cap less than block base fee') || has('maxfeepergas')) return t ? t('tx.err_fee_cap_too_low') : 'Max fee too low.';
  if (has('max priority fee per gas') || has('priority fee')) return t ? t('tx.err_priority_fee_too_low') : 'Priority fee too low.';
  if (has('intrinsic gas too low')) return t ? t('tx.err_intrinsic_gas_too_low') : 'Intrinsic gas too low.';

  // Revert / execution errors
  if (has('execution reverted') || has('revert')) {
    const base = t ? t('tx.err_execution_reverted') : 'Execution reverted.';
    if (hasReason) return `${base} ${t ? t('tx.err_reason') : 'Reason'}: ${reason}`;
    return base;
  }

  // Default fallback with truncation
  const finalMsg = msgRaw || '';
  if (finalMsg.length > 150) return finalMsg.slice(0, 150) + "...";
  return finalMsg || (t ? t('tx.err_transaction_failed') : "Transaction failed");
};
