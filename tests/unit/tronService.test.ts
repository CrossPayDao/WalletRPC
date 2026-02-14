import { afterEach, describe, expect, it, vi } from 'vitest';
import { TronService } from '../../services/tronService';

describe('TronService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('地址校验可以拦截明显非法输入', () => {
    expect(TronService.isValidBase58Address('not-an-address')).toBe(false);
    expect(TronService.isValidBase58Address('T123')).toBe(false);
  });

  it('toHexAddress 对非法地址返回空串', () => {
    expect(TronService.toHexAddress('abc')).toBe('0x');
    expect(TronService.toHexAddress('')).toBe('');
  });

  it('getTransactionInfo 正确识别未上链与成功状态', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      json: async () => ({})
    } as Response);
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ receipt: { result: 'SUCCESS' } })
    } as Response);

    const notFound = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x1');
    const found = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x2');

    expect(notFound).toEqual({ found: false });
    expect(found).toEqual({ found: true, success: true });
  });
});
