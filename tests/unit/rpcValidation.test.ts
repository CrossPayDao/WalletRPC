import { describe, expect, it, vi } from 'vitest';
import { isHttpUrl, probeEvmChainId, validateEvmRpcEndpoint } from '../../services/rpcValidation';

describe('rpcValidation', () => {
  it('isHttpUrl 仅允许 http/https', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('http://localhost:8545')).toBe(true);
    expect(isHttpUrl('ws://example.com')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('probeEvmChainId 可解析 eth_chainId 响应', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x1' })
    } as Response);

    const chainId = await probeEvmChainId('https://rpc.local');
    expect(chainId).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('validateEvmRpcEndpoint 会对 chainId 不匹配返回错误', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x2' })
    } as Response);

    const result = await validateEvmRpcEndpoint('https://rpc.local', 1);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe('rpc_chainid_mismatch');
      if (result.code === 'rpc_chainid_mismatch') {
        expect(result.expected).toBe(1);
        expect(result.got).toBe(2);
      }
    }
  });
});
