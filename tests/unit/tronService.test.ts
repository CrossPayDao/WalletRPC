import { afterEach, describe, expect, it, vi } from 'vitest';
import { TronService } from '../../services/tronService';

const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7f9e9955f5d5f8d6f2ad4d9c7cb4d95';
const HEX_TRON_ADDR = `0x41${'1'.repeat(40)}`;

describe('TronService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('地址校验可以拦截明显非法输入', () => {
    expect(TronService.isValidBase58Address('not-an-address')).toBe(false);
    expect(TronService.isValidBase58Address('T123')).toBe(false);
  });

  it('toHexAddress 对非法地址返回空串', () => {
    expect(TronService.toHexAddress('abc')).toBe('');
    expect(TronService.toHexAddress('')).toBe('');
  });

  it('getBalance 使用标准 endpoint 并解析 bigint 余额', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: 123456 })
    } as Response);

    const result = await TronService.getBalance('https://nile.trongrid.io/', HEX_TRON_ADDR);
    expect(result).toBe(123456n);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nile.trongrid.io/wallet/getaccount',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getBalance 会将 /jsonrpc 形式的 host 归一化为 REST base', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: 1 })
    } as Response);

    await TronService.getBalance('https://nile.trongrid.io/jsonrpc', HEX_TRON_ADDR);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nile.trongrid.io/wallet/getaccount',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getTRC20Balance 解析 constant_result 并返回 bigint', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ constant_result: ['00000000000000000000000000000000000000000000000000000000000003e8'] })
    } as Response);

    const result = await TronService.getTRC20Balance('https://nile.trongrid.io', HEX_TRON_ADDR, HEX_TRON_ADDR);
    expect(result).toBe(1000n);
  });

  it('getTransactionInfo 正确识别未上链与成功状态', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ receipt: { result: 'SUCCESS' } })
    } as Response);

    const notFound = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x1');
    const found = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x2');

    expect(notFound).toEqual({ found: false });
    expect(found).toEqual({ found: true, success: true });
  });

  it('getTransactionInfo 在 receipt 非 SUCCESS 时返回失败状态', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ receipt: { result: 'OUT_OF_ENERGY' } })
    } as Response);

    const failed = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x3');
    expect(failed).toEqual({ found: true, success: false });
  });

  it('getTransactionInfo 在无 receipt 但有 blockNumber 时判定为成功（避免误超时）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ blockNumber: 123456 })
    } as Response);

    const result = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x4');
    expect(result).toEqual({ found: true, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getTransactionInfo 在 info 未给出结果时回退 gettransactionbyid 的 contractRet', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'pending-but-known' })
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ret: [{ contractRet: 'SUCCESS' }] })
    } as Response);

    const result = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x5');
    expect(result).toEqual({ found: true, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://nile.trongrid.io/wallet/gettransactionbyid',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getNodeWitnesses 命中 24 小时缓存时不重复请求', async () => {
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        witnesses: [
          {
            address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
            url: 'https://example.org'
          }
        ]
      })
    } as Response);

    const first = await TronService.getNodeWitnesses('https://nile.trongrid.io');
    const second = await TronService.getNodeWitnesses('https://nile.trongrid.io');

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sendTransaction 原生转账成功路径返回 txid', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ txID: 'a'.repeat(64) })
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: true })
    } as Response);

    const result = await TronService.sendTransaction(
      'https://nile.trongrid.io/',
      TEST_PRIVATE_KEY,
      HEX_TRON_ADDR,
      1000n
    );

    expect(result).toEqual({ success: true, txid: 'a'.repeat(64) });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://nile.trongrid.io/wallet/createtransaction',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://nile.trongrid.io/wallet/broadcasttransaction',
      expect.any(Object)
    );
  });

  it('sendTransaction 对超出安全整数的原生金额进行拦截', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const result = await TronService.sendTransaction(
      'https://nile.trongrid.io',
      TEST_PRIVATE_KEY,
      HEX_TRON_ADDR,
      BigInt(Number.MAX_SAFE_INTEGER) + 1n
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('safe integer');
  });

  it('sendTransaction 在 TRC20 trigger 失败时返回错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { result: false, message: 'trigger failed' } })
    } as Response);

    const result = await TronService.sendTransaction(
      'https://nile.trongrid.io',
      TEST_PRIVATE_KEY,
      HEX_TRON_ADDR,
      1n,
      HEX_TRON_ADDR
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('trigger failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getAccountResources 会映射资源字段并返回 number', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        EnergyLimit: 1000,
        EnergyUsed: 100,
        freeNetLimit: 2000,
        freeNetUsed: 300,
        NetLimit: 500,
        NetUsed: 50,
        tronPowerLimit: 10,
        tronPowerUsed: 4
      })
    } as Response);

    const out = await TronService.getAccountResources('https://nile.trongrid.io', HEX_TRON_ADDR);
    expect(out).toEqual({
      energyLimit: 1000,
      energyUsed: 100,
      freeNetLimit: 2000,
      freeNetUsed: 300,
      netLimit: 500,
      netUsed: 50,
      tronPowerLimit: 10,
      tronPowerUsed: 4
    });
  });

  it('getCanWithdrawUnfreeze 在异常时返回 0n', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    } as Response);
    const out = await TronService.getCanWithdrawUnfreeze('https://nile.trongrid.io', HEX_TRON_ADDR);
    expect(out).toBe(0n);
  });

  it('getVoteStatus 在响应不可解析时返回空数组（容错）', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        votes: [{ vote_address: 'bad_hex', vote_count: 7 }]
      })
    } as Response);

    const out = await TronService.getVoteStatus('https://nile.trongrid.io', HEX_TRON_ADDR);
    expect(out).toEqual([]);
  });

  it('getRewardInfo 能解析奖励并计算 canClaim', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reward: 1200 })
    } as Response);

    const out = await TronService.getRewardInfo('https://nile.trongrid.io', HEX_TRON_ADDR);
    expect(out).toEqual({ claimableSun: 1200n, canClaim: true });
  });

  it('claimReward 在节点返回 result=false 时返回失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { result: false }, code: 'DENIED' })
    } as Response);

    const out = await TronService.claimReward('https://nile.trongrid.io', TEST_PRIVATE_KEY);
    expect(out.success).toBe(false);
  });

  it('voteWitnesses 对无效票列表直接拦截', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const out = await TronService.voteWitnesses('https://nile.trongrid.io', TEST_PRIVATE_KEY, [
      { address: 'bad-address', votes: 0 }
    ]);
    expect(out).toEqual({ success: false, error: 'Vote count must be greater than 0' });
  });

  it('getBalance 在 HTTP 非 2xx 时应抛错（由上层决定是否保留旧值或展示错误）', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    } as Response);

    await expect(TronService.getBalance('https://nile.trongrid.io', HEX_TRON_ADDR)).rejects.toThrow(/HTTP 503/i);
  });

  it('probeRpc 在超时场景下应返回 ok=false 且错误为 timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(() => new Promise(() => {}));

    const p = TronService.probeRpc('https://nile.trongrid.io');
    await vi.advanceTimersByTimeAsync(9000);
    const result = await p;

    expect(result.ok).toBe(false);
    expect(String(result.error || '')).toMatch(/timeout/i);

    fetchMock.mockRestore();
    vi.useRealTimers();
  });
});
