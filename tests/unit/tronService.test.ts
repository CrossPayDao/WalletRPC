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

  it('stakeResource 在 owner 地址无效时直接失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);

    const out = await TronService.stakeResource('https://nile.trongrid.io', TEST_PRIVATE_KEY, 10n, 'ENERGY');
    expect(out).toEqual({ success: false, error: 'Invalid owner address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stakeResource 在 amount 非法时返回 safe integer 错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const out = await TronService.stakeResource(
      'https://nile.trongrid.io',
      TEST_PRIVATE_KEY,
      BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      'ENERGY'
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/safe integer/i);
  });

  it('voteWitnesses 在 hex 失败后会回退到 base58 visible=true 请求', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ txID: 'b'.repeat(64), raw_data: {} }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: true }) } as Response);

    const out = await TronService.voteWitnesses('https://nile.trongrid.io', TEST_PRIVATE_KEY, [
      { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', votes: 3 }
    ]);
    expect(out).toEqual({ success: true, txid: 'b'.repeat(64) });

    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body ?? '{}'));
    expect(secondBody.visible).toBe(true);
  });

  it('getRewardInfo 在前两种 body 失败时会尝试 visible=true 的 address', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 405, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reward: 9 }) } as Response);

    const out = await TronService.getRewardInfo('https://nile.trongrid.io', HEX_TRON_ADDR);
    expect(out).toEqual({ claimableSun: 9n, canClaim: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('claimReward 在网络异常时返回 claim reward failed 分支', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('network down'));
    const out = await TronService.claimReward('https://nile.trongrid.io', TEST_PRIVATE_KEY);
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/network down|claim reward failed/i);
  });

  it('getTransactionInfo 在 fallback contractRet 非 SUCCESS 时返回失败', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'x' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ret: [{ contractRet: 'REVERT' }] }) } as Response);

    const out = await TronService.getTransactionInfo('https://nile.trongrid.io', '0x6');
    expect(out).toEqual({ found: true, success: false });
  });

  it('probeRpc 在返回非 block 结构时应报 Unexpected response', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' })
    } as Response);
    const out = await TronService.probeRpc('https://nile.trongrid.io');
    expect(out).toEqual({ ok: false, error: 'Unexpected response' });
  });

  it('getTRC20Balance 在无 constant_result 时返回 0n', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ constant_result: [] })
    } as Response);

    const out = await TronService.getTRC20Balance('https://nile.trongrid.io', HEX_TRON_ADDR, HEX_TRON_ADDR);
    expect(out).toBe(0n);
  });

  it('stakeResource 在 tx.result.result=false 时返回解析后的错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { result: false }, code: '0x4261642052657175657374' })
    } as Response);
    const out = await TronService.stakeResource('https://nile.trongrid.io', TEST_PRIVATE_KEY, 100n, 'ENERGY');
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/Bad Request|0x4261/i);
  });

  it('unstakeResource / withdrawUnfreeze 在 owner 无效时直接失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    const u1 = await TronService.unstakeResource('https://nile.trongrid.io', TEST_PRIVATE_KEY, 10n, 'BANDWIDTH');
    const u2 = await TronService.withdrawUnfreeze('https://nile.trongrid.io', TEST_PRIVATE_KEY);
    expect(u1).toEqual({ success: false, error: 'Invalid owner address' });
    expect(u2).toEqual({ success: false, error: 'Invalid owner address' });
  });

  it('unstakeResource / withdrawUnfreeze 在节点 result=false 时返回失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { result: false }, message: 'QmFkIG9w' })
    } as Response);

    const u1 = await TronService.unstakeResource('https://nile.trongrid.io', TEST_PRIVATE_KEY, 10n, 'ENERGY');
    const u2 = await TronService.withdrawUnfreeze('https://nile.trongrid.io', TEST_PRIVATE_KEY);
    expect(u1.success).toBe(false);
    expect(u2.success).toBe(false);
  });

  it('voteWitnesses 在 owner 无效时直接失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    const out = await TronService.voteWitnesses('https://nile.trongrid.io', TEST_PRIVATE_KEY, [
      { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', votes: 1 }
    ]);
    expect(out).toEqual({ success: false, error: 'Invalid owner address' });
  });

  it('voteWitnesses 节点返回 result=false 时透传错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { result: false }, Error: 'Vote denied' })
    } as Response);
    const out = await TronService.voteWitnesses('https://nile.trongrid.io', TEST_PRIVATE_KEY, [
      { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', votes: 1 }
    ]);
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/Vote denied/i);
  });

  it('claimReward 在 owner 无效时直接失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    const out = await TronService.claimReward('https://nile.trongrid.io', TEST_PRIVATE_KEY);
    expect(out).toEqual({ success: false, error: 'Invalid owner address' });
  });

  it('sendTransaction 在 host 为空和地址非法时返回失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    const noHost = await TronService.sendTransaction('', TEST_PRIVATE_KEY, HEX_TRON_ADDR, 1n);
    const badAddr = await TronService.sendTransaction('https://nile.trongrid.io', TEST_PRIVATE_KEY, HEX_TRON_ADDR, 1n);
    expect(noHost).toEqual({ success: false, error: 'Missing TRON RPC base URL' });
    expect(badAddr).toEqual({ success: false, error: 'Invalid address' });
  });

  it('sendTransaction 对非法合约地址应失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const out = await TronService.sendTransaction(
      'https://nile.trongrid.io',
      TEST_PRIVATE_KEY,
      HEX_TRON_ADDR,
      1n,
      'invalid-contract'
    );
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/Invalid contract address/i);
  });

  it('sendTransaction 当 transaction.Error 存在时返回失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ txID: 'c'.repeat(64), Error: 'tx build failed' })
    } as Response);
    const out = await TronService.sendTransaction('https://nile.trongrid.io', TEST_PRIVATE_KEY, HEX_TRON_ADDR, 1n);
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/tx build failed/i);
  });

  it('sendTransaction 广播失败时应解析 message/code 错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ txID: 'd'.repeat(64) })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: false, message: 'VHJhbnNhY3Rpb24gcmVqZWN0ZWQ=' })
      } as Response);

    const out = await TronService.sendTransaction('https://nile.trongrid.io', TEST_PRIVATE_KEY, HEX_TRON_ADDR, 1n);
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/Transaction rejected|VHJh/i);
  });

  it('probeRpc host 为空时直接报 Missing TRON RPC base URL', async () => {
    const out = await TronService.probeRpc('  ');
    expect(out).toEqual({ ok: false, error: 'Missing TRON RPC base URL' });
  });

  it('toHexAddress 输入 0x 地址时应直接透传', () => {
    expect(TronService.toHexAddress(HEX_TRON_ADDR)).toBe(HEX_TRON_ADDR);
  });
});
