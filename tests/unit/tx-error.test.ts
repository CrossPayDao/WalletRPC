import { describe, expect, it } from 'vitest';
import { handleTxError } from '../../features/wallet/utils';

describe('handleTxError', () => {
  it('映射常见 ethers 错误码', () => {
    const t = (k: string) => k;
    expect(handleTxError({ code: 'INSUFFICIENT_FUNDS' }, t)).toBe('tx.err_insufficient_funds');
    expect(handleTxError({ code: 'NONCE_EXPIRED' }, t)).toBe('tx.err_nonce_expired');
    expect(handleTxError({ code: 'ACTION_REJECTED' }, t)).toBe('tx.err_action_rejected');
  });

  it('映射 Safe 特定错误码', () => {
    const t = (k: string) => k;
    expect(handleTxError({ message: 'execution reverted: GS013' }, t)).toBe('tx.err_safe_gs013');
    expect(handleTxError({ message: 'GS026' }, t)).toBe('tx.err_safe_gs026');
  });

  it('映射常见网络 / 网关错误', () => {
    const t = (k: string) => k;
    expect(handleTxError({ message: 'Failed to fetch' }, t)).toBe('tx.err_network_error');
    expect(handleTxError({ message: 'timeout' }, t)).toBe('tx.err_timeout');
    expect(handleTxError({ status: 429, message: 'Too Many Requests' }, t)).toBe('tx.err_rpc_rate_limited');
    expect(handleTxError({ status: 403, message: 'Forbidden' }, t)).toBe('tx.err_rpc_forbidden');
  });

  it('映射常见 JSON-RPC 错误码', () => {
    const t = (k: string) => k;
    expect(handleTxError({ error: { code: -32601, message: 'Method not found' } }, t)).toBe('tx.err_rpc_method_not_found');
    expect(handleTxError({ error: { code: -32602, message: 'invalid params' } }, t)).toBe('tx.err_rpc_invalid_params');
    expect(handleTxError({ error: { code: -32603, message: 'internal error' } }, t)).toBe('tx.err_rpc_internal_error');
  });

  it('应能从 could not coalesce error 中提取底层错误并映射', () => {
    const t = (k: string) => k;
    expect(handleTxError({ message: 'could not coalesce error', error: { code: -32005, message: 'rate limited' } }, t)).toBe('tx.err_rpc_rate_limited');
  });

  it('兜底返回 message 并截断', () => {
    const long = 'x'.repeat(200);
    expect(handleTxError({ message: long }).length).toBeLessThanOrEqual(153);
  });
});
