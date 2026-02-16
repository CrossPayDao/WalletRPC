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

  it('probeEvmChainId 在 HTTP 非 2xx 时抛错', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    } as Response);

    await expect(probeEvmChainId('https://rpc.local')).rejects.toThrow(/HTTP 503/);
  });

  it('probeEvmChainId 在返回格式非法时抛错', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: 1 })
    } as Response);

    await expect(probeEvmChainId('https://rpc.local')).rejects.toThrow(/Invalid RPC response/);
  });

  it('validateEvmRpcEndpoint 会拒绝非 http(s) scheme', async () => {
    const result = await validateEvmRpcEndpoint('ws://rpc.local', 1);
    expect(result).toEqual({ ok: false, code: 'rpc_url_invalid_scheme' });
  });

  it('validateEvmRpcEndpoint 在探测失败时返回 rpc_validation_failed', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('network down'));
    const result = await validateEvmRpcEndpoint('https://rpc.local', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('rpc_validation_failed');
      expect(result.detail).toMatch(/network down/);
    }
  });
});
