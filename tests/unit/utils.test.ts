import { describe, expect, it } from 'vitest';
import { getActiveExplorer, getExplorerAddressLink, getExplorerLink, handleTxError, normalizeHex } from '../../features/wallet/utils';
import { ChainConfig } from '../../features/wallet/types';

const chain: ChainConfig = {
  id: 1,
  name: 'Ethereum',
  defaultRpcUrl: 'https://example-rpc.local',
  publicRpcUrls: [],
  currencySymbol: 'ETH',
  chainType: 'EVM',
  tokens: [],
  explorers: [
    {
      name: 'ExplorerA',
      key: 'a',
      url: 'https://a.local',
      txPath: 'https://a.local/tx/{txid}',
      addressPath: 'https://a.local/address/{address}'
    },
    {
      name: 'ExplorerB',
      key: 'b',
      url: 'https://b.local',
      txPath: 'https://b.local/tx/{txid}',
      addressPath: 'https://b.local/address/{address}'
    }
  ]
};

describe('wallet utils', () => {
  it('normalizeHex 会补齐前导 0 并补上 0x', () => {
    expect(normalizeHex('abc')).toBe('0x0abc');
    expect(normalizeHex('0x1234')).toBe('0x1234');
  });

  it('根据 defaultExplorerKey 返回正确 explorer', () => {
    const active = getActiveExplorer({ ...chain, defaultExplorerKey: 'b' });
    expect(active?.name).toBe('ExplorerB');
  });

  it('生成交易和地址浏览器链接', () => {
    expect(getExplorerLink(chain, '0xhash')).toBe('https://a.local/tx/0xhash');
    expect(getExplorerAddressLink(chain, '0xabc')).toBe('https://a.local/address/0xabc');
  });

  it('explorer 缺失时返回 #', () => {
    const noExplorer = { ...chain, explorers: [] };
    expect(getActiveExplorer(noExplorer)).toBeUndefined();
    expect(getExplorerLink(noExplorer, '0x1')).toBe('#');
    expect(getExplorerAddressLink(noExplorer, '0x1')).toBe('#');
  });

  it('handleTxError: 处理 ethers 错误码', () => {
    expect(handleTxError({ code: 'INSUFFICIENT_FUNDS' })).toMatch(/Insufficient funds/i);
    expect(handleTxError({ code: 'NUMERIC_FAULT' })).toMatch(/Invalid numeric value/i);
    expect(handleTxError({ code: 'NONCE_EXPIRED' })).toMatch(/Nonce expired/i);
    expect(handleTxError({ code: 'REPLACEMENT_UNDERPRICED' })).toMatch(/underpriced/i);
    expect(handleTxError({ code: 'ACTION_REJECTED' })).toMatch(/rejected by user/i);
    expect(handleTxError({ code: 'CALL_EXCEPTION' })).toMatch(/reverted on-chain/i);
    expect(handleTxError({ code: 'UNPREDICTABLE_GAS_LIMIT' })).toMatch(/Cannot estimate gas/i);
  });

  it('handleTxError: 处理网络和网关错误', () => {
    expect(handleTxError({ message: 'request timeout' })).toBe('Request timed out.');
    expect(handleTxError({ message: 'Failed to fetch' })).toBe('Network error.');
    expect(handleTxError({ message: 'CORS blocked by Access-Control-Allow-Origin' })).toBe('CORS blocked by RPC endpoint.');
    expect(handleTxError({ message: 'ERR_CONNECTION_REFUSED' })).toBe('Connection refused.');
    expect(handleTxError({ message: 'ENOTFOUND' })).toBe('DNS resolution failed.');
    expect(handleTxError({ message: 'too many requests' })).toBe('Rate limited.');
    expect(handleTxError({ statusCode: 401 })).toBe('Unauthorized.');
    expect(handleTxError({ status: 403 })).toBe('Forbidden.');
    expect(handleTxError({ response: { status: 404 } })).toBe('Not found.');
    expect(handleTxError({ statusCode: 502 })).toBe('Bad gateway.');
    expect(handleTxError({ statusCode: 503 })).toBe('Service unavailable.');
    expect(handleTxError({ statusCode: 504 })).toBe('Gateway timeout.');
    expect(handleTxError({ statusCode: 418 })).toBe('RPC HTTP error 418');
  });

  it('handleTxError: 处理 JSON-RPC 与 Safe 专用错误', () => {
    expect(handleTxError({ error: { code: -32700 } })).toBe('RPC parse error.');
    expect(handleTxError({ info: { error: { code: -32600 } } })).toBe('RPC invalid request.');
    expect(handleTxError({ error: { code: -32601 } })).toBe('RPC method not found.');
    expect(handleTxError({ message: 'method not found' })).toBe('RPC method not found.');
    expect(handleTxError({ error: { code: -32602 } })).toBe('Invalid params.');
    expect(handleTxError({ error: { code: -32603 } })).toBe('RPC internal error.');
    expect(handleTxError({ error: { code: -32005 } })).toBe('Rate limited.');
    expect(handleTxError({ error: { code: -32016 } })).toBe('Rate limited.');
    expect(handleTxError({ message: 'GS013' })).toMatch(/GS013/);
    expect(handleTxError({ message: 'GS026' })).toMatch(/GS026/);
  });

  it('handleTxError: 处理费率与回滚场景', () => {
    expect(handleTxError({ message: 'replacement transaction underpriced' })).toBe('Transaction underpriced.');
    expect(handleTxError({ message: 'max fee per gas less than block base fee' })).toBe('Max fee too low.');
    expect(handleTxError({ message: 'max priority fee per gas too low' })).toBe('Priority fee too low.');
    expect(handleTxError({ message: 'intrinsic gas too low' })).toBe('Intrinsic gas too low.');
    expect(handleTxError({ message: 'execution reverted' })).toBe('Execution reverted.');
    expect(handleTxError({ message: 'execution reverted', reason: 'not owner' })).toBe('Execution reverted. Reason: not owner');
  });

  it('handleTxError: 回退与长文本截断', () => {
    expect(handleTxError('plain-error')).toBe('plain-error');
    expect(handleTxError({ shortMessage: 'could not coalesce error', error: { message: 'secondary msg' } })).toBe('secondary msg');
    const longMsg = 'x'.repeat(200);
    expect(handleTxError({ message: longMsg })).toBe(`${'x'.repeat(150)}...`);
    expect(handleTxError({})).toBe('Transaction failed');
  });
});
