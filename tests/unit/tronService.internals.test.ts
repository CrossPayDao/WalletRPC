import { afterEach, describe, expect, it, vi } from 'vitest';
import { __TRON_TEST__, TronService } from '../../services/tronService';

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7f9e9955f5d5f8d6f2ad4d9c7cb4d95';
const HEX_TRON_ADDR = `0x41${'1'.repeat(40)}`;

describe('TronService internals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __TRON_TEST__.clearWitnessCache();
  });

  it('bytesToHex/toResource/toSafeAmountNumber 覆盖分支', () => {
    expect(__TRON_TEST__.bytesToHex(new Uint8Array([1, 255]))).toBe('0x01ff');
    expect(__TRON_TEST__.toResource('ENERGY')).toBe('ENERGY');
    expect(__TRON_TEST__.toResource('BANDWIDTH')).toBe('BANDWIDTH');

    expect(__TRON_TEST__.toSafeAmountNumber(1n)).toBe(1);
    expect(() => __TRON_TEST__.toSafeAmountNumber(0n)).toThrow(/positive safe integer/);
    expect(() => __TRON_TEST__.toSafeAmountNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/positive safe integer/);
  });

  it('decode 与 parseApiError 处理 hex/base64/fallback', () => {
    const hex = '48656c6c6f';
    const b64 = Buffer.from('World').toString('base64');

    expect(__TRON_TEST__.tryDecodeHexAscii(hex)).toBe('Hello');
    expect(__TRON_TEST__.tryDecodeHexAscii('0xGG')).toBeNull();
    expect(__TRON_TEST__.tryDecodeHexAscii(123 as any)).toBeNull();

    expect(__TRON_TEST__.tryDecodeBase64Ascii(b64)).toBe('World');
    expect(__TRON_TEST__.tryDecodeBase64Ascii('@@@')).toBeNull();
    expect(__TRON_TEST__.tryDecodeBase64Ascii('')).toBeNull();

    expect(__TRON_TEST__.parseApiError({ message: hex })).toBe('Hello');
    expect(__TRON_TEST__.parseApiError({ Error: b64 })).toBe('World');
    expect(__TRON_TEST__.parseApiError({ code: 'ERR_X' })).toBe('ERR_X');
  });

  it('decode 对不可打印字符与 atob 缺失场景保持健壮', () => {
    expect(__TRON_TEST__.tryDecodeHexAscii('00010203')).toBeNull();

    const oldAtob = (globalThis as any).atob;
    // 走 Buffer 分支
    (globalThis as any).atob = undefined;
    const b64 = Buffer.from('fallback-via-buffer').toString('base64');
    expect(__TRON_TEST__.tryDecodeBase64Ascii(b64)).toBe('fallback-via-buffer');
    (globalThis as any).atob = oldAtob;
  });

  it('toTxPayload 处理 transaction/raw/非法输入', () => {
    expect(__TRON_TEST__.toTxPayload({ transaction: { txID: 'abc' } })).toEqual({ txID: 'abc' });
    expect(__TRON_TEST__.toTxPayload({ txID: 'abc', raw_data: {} })).toEqual({ txID: 'abc', raw_data: {} });
    expect(() => __TRON_TEST__.toTxPayload(null)).toThrow(/Empty transaction payload/);
    expect(() => __TRON_TEST__.toTxPayload({})).toThrow(/Invalid transaction payload/);
  });

  it('fetchWithTimeout 成功返回原始响应', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true } as any);
    await expect(__TRON_TEST__.fetchWithTimeout('https://x', { method: 'POST' }, 30)).resolves.toEqual({ ok: true });
  });

  it('postJson/postJsonFirstSuccess 覆盖 HTTP 错误、JSON 错误与回退成功', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as any);
    await expect(__TRON_TEST__.postJson('https://x', {})).rejects.toThrow('HTTP 503');

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad'); } } as any);
    await expect(__TRON_TEST__.postJson('https://x', {})).rejects.toThrow('Invalid JSON response');

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: 1 }) } as any);
    await expect(
      __TRON_TEST__.postJsonFirstSuccess([
        { url: 'https://a', body: {} },
        { url: 'https://b', body: {} }
      ])
    ).resolves.toEqual({ ok: 1 });

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any)
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) } as any);
    await expect(
      __TRON_TEST__.postJsonFirstSuccess([
        { url: 'https://a', body: {} },
        { url: 'https://b', body: {} }
      ])
    ).rejects.toThrow(/HTTP 502/);

    await expect(__TRON_TEST__.postJsonFirstSuccess([])).rejects.toThrow('All endpoint attempts failed');
  });

  it('signAndBroadcast 成功、缺失 txID、广播失败解码', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: true }) } as any);

    const ok = await __TRON_TEST__.signAndBroadcast('https://nile.trongrid.io', PRIVATE_KEY, {
      txID: 'a'.repeat(64),
      raw_data: {}
    });
    expect(ok).toEqual({ success: true, txid: 'a'.repeat(64) });

    await expect(
      __TRON_TEST__.signAndBroadcast('https://nile.trongrid.io', PRIVATE_KEY, { transaction: {} })
    ).rejects.toThrow(/Missing txID/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: false, message: Buffer.from('broadcast failed').toString('base64') })
    } as any);
    const fail = await __TRON_TEST__.signAndBroadcast('https://nile.trongrid.io', PRIVATE_KEY, {
      txID: 'b'.repeat(64),
      raw_data: {}
    });
    expect(fail.success).toBe(false);
    expect(fail.error).toContain('broadcast failed');
  });

  it('witness 缓存可写入并可清空', async () => {
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ witnesses: [{ address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', url: '' }] })
    } as any);

    expect(__TRON_TEST__.getWitnessCacheSize()).toBe(0);
    await TronService.getNodeWitnesses('https://nile.trongrid.io');
    expect(__TRON_TEST__.getWitnessCacheSize()).toBe(1);
    __TRON_TEST__.clearWitnessCache();
    expect(__TRON_TEST__.getWitnessCacheSize()).toBe(0);
  });

  it('getBalance/getTRC20Balance 在抛出非 Error 时应转为 Error 文本', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue('raw-error');
    await expect(TronService.getBalance('https://nile.trongrid.io', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')).rejects.toThrow('raw-error');
    await expect(
      TronService.getTRC20Balance(
        'https://nile.trongrid.io',
        'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE'
      )
    ).rejects.toThrow('raw-error');
  });

  it('getBalance 缺失 balance 字段时回退 0，getTRC20Balance 的 Error 会原样抛出', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({})
    } as any);
    await expect(TronService.getBalance('https://nile.trongrid.io', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')).resolves.toBe(0n);

    fetchMock.mockRejectedValueOnce(new Error('hard-fail'));
    await expect(
      TronService.getTRC20Balance(
        'https://nile.trongrid.io',
        'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE'
      )
    ).rejects.toThrow('hard-fail');
  });

  it('getRewardInfo reward=0 时 canClaim=false，probeRpc 非 Error 失败时返回字符串', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reward: 0 })
    } as any);
    await expect(TronService.getRewardInfo('https://nile.trongrid.io', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')).resolves.toEqual({
      claimableSun: 0n,
      canClaim: false
    });

    fetchMock.mockRejectedValueOnce('network-raw');
    await expect(TronService.probeRpc('https://nile.trongrid.io')).resolves.toEqual({
      ok: false,
      error: 'network-raw'
    });
  });

  it('toHexAddress/fromHexAddress 覆盖非 0x 输入与非法长度分支', () => {
    expect(TronService.toHexAddress('invalid-base58')).toBe('');
    expect(() => TronService.fromHexAddress('41' + '11'.repeat(20))).toThrow();
  });

  it('parseApiError 在 message/Error/code 缺失时回退 Unknown error', () => {
    expect(__TRON_TEST__.parseApiError({})).toBe('Unknown error');
  });

  it('getNodeWitnesses 在缓存存在且请求失败时返回缓存值', async () => {
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ witnesses: [{ address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', url: 'https://a' }] })
    } as any);
    const first = await TronService.getNodeWitnesses('https://nile.trongrid.io');
    expect(first.length).toBe(1);

    __TRON_TEST__.clearWitnessCache();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ witnesses: [{ address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', url: 'https://a' }] })
    } as any);
    await TronService.getNodeWitnesses('https://api.trongrid.io');

    fetchMock.mockRejectedValueOnce(new Error('rpc down'));
    const out = await TronService.getNodeWitnesses('https://api.trongrid.io');
    expect(out.length).toBe(1);
  });

  it('getNodeWitnesses 在 listWitnesses 回退包含脏数据时应容错返回', async () => {
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          witnesses: [
            { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', url: 123 },
            { address: '41' + '11'.repeat(20), url: 456 },
            { address: '', url: '' }
          ]
        })
      } as any);

    const out = await TronService.getNodeWitnesses('https://nile.trongrid.io');
    expect(Array.isArray(out)).toBe(true);
  });

  it('getAccountResources / getCanWithdrawUnfreeze 缺字段时回退默认值', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as any);

    const res = await TronService.getAccountResources('https://nile.trongrid.io', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE');
    expect(res.energyLimit).toBe(0);
    expect(res.netUsed).toBe(0);

    const amount = await TronService.getCanWithdrawUnfreeze('https://nile.trongrid.io', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE');
    expect(amount).toBe(0n);
  });

  it('sendTransaction 广播失败时 code 回退为错误字符串', async () => {
    const pk = '0x59c6995e998f97a5a0044966f0945382d7f9e9955f5d5f8d6f2ad4d9c7cb4d95';
    const owner = `0x41${'1'.repeat(40)}`;
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(owner);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ txID: 'f'.repeat(64) }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: false, code: 'BROADCAST_FAIL' }) } as any);

    const out = await TronService.sendTransaction('https://nile.trongrid.io', pk, owner, 1n);
    expect(out.success).toBe(false);
    expect(out.error).toContain('BROADCAST_FAIL');
  });

  it('normalizeHost 对空串与 jsonrpc 尾缀做规范化', () => {
    expect(TronService.normalizeHost('')).toBe('');
    expect(TronService.normalizeHost(' https://api.trongrid.io/jsonrpc/ ')).toBe('https://api.trongrid.io');
  });

  it('getNodeWitnesses 节点返回空列表时应返回空并不写缓存', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ witnesses: [] })
    } as any);

    const out = await TronService.getNodeWitnesses('https://nile.trongrid.io');
    expect(out).toEqual([]);
    expect(__TRON_TEST__.getWitnessCacheSize()).toBe(0);
  });

  it('getVoteStatus 在 votes 缺失时返回空数组', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as any);
    await expect(TronService.getVoteStatus('https://nile.trongrid.io', HEX_TRON_ADDR)).resolves.toEqual([]);
  });

  it('unstake/withdraw/vote 在 tx.result.result=false 时返回解析错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: { result: false }, message: '6661696c' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: { result: false }, message: '6661696c' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: { result: false }, message: '6661696c' }) } as any);

    const a = await TronService.unstakeResource('https://nile.trongrid.io', PRIVATE_KEY, 1n, 'ENERGY');
    const b = await TronService.withdrawUnfreeze('https://nile.trongrid.io', PRIVATE_KEY);
    const c = await TronService.voteWitnesses('https://nile.trongrid.io', PRIVATE_KEY, [
      { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', votes: 1 }
    ]);

    expect(a.success).toBe(false);
    expect(a.error).toContain('fail');
    expect(b.success).toBe(false);
    expect(b.error).toContain('fail');
    expect(c.success).toBe(false);
    expect(c.error).toContain('fail');
  });

  it('stake/claim/vote 在异常对象无 message 时走默认错误文案', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    vi.spyOn(TronService, 'isValidBase58Address').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue({});

    const a = await TronService.stakeResource('https://nile.trongrid.io', PRIVATE_KEY, 1n, 'ENERGY');
    const b = await TronService.claimReward('https://nile.trongrid.io', PRIVATE_KEY);
    const c = await TronService.voteWitnesses('https://nile.trongrid.io', PRIVATE_KEY, [
      { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', votes: 1 }
    ]);
    expect(a.error).toContain('stake failed');
    expect(b.error).toContain('claim reward failed');
    expect(String(c.error)).toContain('All endpoint attempts failed');
  });

  it('claimReward 在 owner 地址无效时应直接失败', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue('');
    await expect(TronService.claimReward('https://nile.trongrid.io', PRIVATE_KEY)).resolves.toEqual({
      success: false,
      error: 'Invalid owner address'
    });
  });

  it('getTransactionInfo fallback 为空对象时返回未找到；无 contractRet 时返回 found=true', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'x' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'y' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ret: [] }) } as any);

    const first = await TronService.getTransactionInfo('https://nile.trongrid.io', '0xaaa');
    const second = await TronService.getTransactionInfo('https://nile.trongrid.io', '0xbbb');
    expect(first).toEqual({ found: false });
    expect(second).toEqual({ found: true });
  });

  it('getTransactionInfo fallback contractRet 非 SUCCESS 时返回失败', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'x' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ret: [{ contractRet: 'OUT_OF_ENERGY' }] }) } as any);

    await expect(TronService.getTransactionInfo('https://nile.trongrid.io', '0xccc')).resolves.toEqual({
      found: true,
      success: false
    });
  });

  it('sendTransaction TRC20 成功构建后广播失败会回退 code 错误', async () => {
    vi.spyOn(TronService, 'addressFromPrivateKey').mockReturnValue(HEX_TRON_ADDR);
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: { result: true }, transaction: { txID: 'c'.repeat(64), raw_data: {} } })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: false, code: 'BROADCAST_ERR' })
      } as any);

    const out = await TronService.sendTransaction(
      'https://nile.trongrid.io',
      PRIVATE_KEY,
      HEX_TRON_ADDR,
      1n,
      HEX_TRON_ADDR
    );
    expect(out.success).toBe(false);
    expect(String(out.error)).toContain('BROADCAST_ERR');
  });

  it('probeRpc 在返回结构非区块时给出 Unexpected response', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ not: 'block' })
    } as any);
    await expect(TronService.probeRpc('https://nile.trongrid.io')).resolves.toEqual({
      ok: false,
      error: 'Unexpected response'
    });
  });
});
