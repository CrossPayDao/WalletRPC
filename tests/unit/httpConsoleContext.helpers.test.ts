import { describe, expect, it } from 'vitest';
import { __HTTP_CONSOLE_TEST__ } from '../../contexts/HttpConsoleContext';

const t = (k: string) => k;

describe('HttpConsole helpers', () => {
  it('clip 与 safeJsonParse 处理边界输入', async () => {
    expect(__HTTP_CONSOLE_TEST__.clip('abcdef', 3)).toBe('abc...');
    expect(__HTTP_CONSOLE_TEST__.clip('abc', 3)).toBe('abc');

    expect(__HTTP_CONSOLE_TEST__.safeJsonParse('')).toBe('');
    expect(__HTTP_CONSOLE_TEST__.safeJsonParse('plain')).toBe('plain');
    expect(__HTTP_CONSOLE_TEST__.safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(__HTTP_CONSOLE_TEST__.safeJsonParse('{bad')).toBe('{bad');
  });

  it('toTextBody 支持 string/ArrayBuffer/TypedArray/Blob/Request', async () => {
    expect(await __HTTP_CONSOLE_TEST__.toTextBody('/x', { body: 'hello' })).toBe('hello');

    const ab = new ArrayBuffer(3);
    new Uint8Array(ab).set([98, 117, 102]); // "buf"
    expect(await __HTTP_CONSOLE_TEST__.toTextBody('/x', { body: ab })).toBe('buf');

    const ta = new Uint8Array(new TextEncoder().encode('typed'));
    expect(await __HTTP_CONSOLE_TEST__.toTextBody('/x', { body: ta })).toBe('typed');

    if (typeof Blob !== 'undefined') {
      const blob = new Blob(['blob-body']);
      const blobBody = await __HTTP_CONSOLE_TEST__.toTextBody('/x', { body: blob });
      expect(typeof blobBody === 'string' || blobBody === null).toBe(true);
    }

    if (typeof Request !== 'undefined') {
      const req = new Request('https://example.com', { method: 'POST', body: 'req-body' });
      expect(await __HTTP_CONSOLE_TEST__.toTextBody(req)).toBe('req-body');
      const req2 = new Request('https://example.com', { method: 'POST', body: '' });
      expect(await __HTTP_CONSOLE_TEST__.toTextBody(req2)).toBeNull();
    }

    expect(await __HTTP_CONSOLE_TEST__.toTextBody('/x', { body: { a: 1 } as any })).toBeNull();
  });

  it('redactRpcPayload 对大十六进制与 rawTx 参数脱敏', () => {
    const longHex = `0x${'ab'.repeat(64)}`;
    const payload = {
      method: 'eth_sendRawTransaction',
      params: [longHex],
      nested: { data: longHex }
    };

    expect(__HTTP_CONSOLE_TEST__.redactRpcPayload(payload)).toEqual({
      method: 'eth_sendRawTransaction',
      params: ['[redacted]'],
      nested: { data: expect.stringMatching(/^0x[0-9a-f]+\.\.\.[0-9a-f]+$/) }
    });
  });

  it('deriveRpcMeta/getSelector 覆盖 batch/object/invalid 场景', () => {
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta(null)).toEqual({});
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta('x')).toEqual({});
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta([{ method: 'eth_chainId' }, { method: 'eth_getBalance' }])).toEqual({
      rpcMethod: 'eth_chainId',
      isBatch: true
    });
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta([{ method: 123 }])).toEqual({ rpcMethod: undefined, isBatch: true });
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta({ method: 'eth_call' })).toEqual({ rpcMethod: 'eth_call', isBatch: false });
    expect(__HTTP_CONSOLE_TEST__.deriveRpcMeta([123, { method: 'eth_getBalance' }])).toEqual({
      rpcMethod: 'eth_getBalance',
      isBatch: true
    });

    expect(__HTTP_CONSOLE_TEST__.getSelector('0x12345678abcd')).toBe('0x12345678');
    expect(__HTTP_CONSOLE_TEST__.getSelector('0x12')).toBeNull();
    expect(__HTTP_CONSOLE_TEST__.getSelector(123 as any)).toBeNull();
  });

  it('describeEthCall 对 Safe/ERC20 与默认路径生效', () => {
    expect(__HTTP_CONSOLE_TEST__.describeEthCall({ data: '0xa0e67e2b' }, t)).toBe('console.intent_safe_owners');
    expect(__HTTP_CONSOLE_TEST__.describeEthCall({ data: '0xe75235b8' }, t)).toBe('console.intent_safe_threshold');
    expect(__HTTP_CONSOLE_TEST__.describeEthCall({ data: '0xaffed0e0' }, t)).toBe('console.intent_safe_nonce');
    expect(__HTTP_CONSOLE_TEST__.describeEthCall({ data: '0x70a08231' }, t)).toBe('console.intent_token_balance');
    expect(__HTTP_CONSOLE_TEST__.describeEthCall({ data: '0x12345678' }, t)).toBe('console.intent_call_contract');
  });

  it('describeRpcCall/actionForRpc 覆盖映射与回退', () => {
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall(undefined, [], t)).toBe('console.action_unknown');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_getBalance', [], t)).toBe('console.intent_get_balance');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_getTransactionCount', [], t)).toBe('console.intent_get_nonce');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_getTransactionReceipt', [], t)).toBe('console.intent_get_receipt');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_sendRawTransaction', [], t)).toBe('console.intent_broadcast_tx');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_getCode', [], t)).toBe('console.intent_get_code');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_getBlockByNumber', [], t)).toBe('console.intent_get_block');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_blockNumber', [], t)).toBe('console.intent_get_block_number');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_chainId', [], t)).toBe('console.intent_chain_id');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_call', [{ data: '0x70a08231' }], t)).toBe('console.intent_token_balance');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_call', { data: '0x70a08231' } as any, t)).toBe('console.intent_call_contract');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_estimateGas', [], t)).toBe('console.intent_estimate_gas');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('eth_feeHistory', [], t)).toBe('console.rpc.eth_feeHistory');
    expect(__HTTP_CONSOLE_TEST__.describeRpcCall('unknown_method', [], t)).toBe('console.intent_rpc_callunknown_method');

    expect(__HTTP_CONSOLE_TEST__.actionForRpc('eth_call', t)).toBe('console.rpc.eth_call');
    expect(__HTTP_CONSOLE_TEST__.actionForRpc('web3_clientVersion', t)).toBe('console.rpc.web3_clientVersion');
    expect(__HTTP_CONSOLE_TEST__.actionForRpc(undefined, t)).toBe('console.action_unknown');
    expect(__HTTP_CONSOLE_TEST__.actionForRpc('unknown', t)).toBe('console.action_unknown');
  });

  it('withBatchPrefix/actionForTronPath/actionForHttp 覆盖路径分支', () => {
    expect(__HTTP_CONSOLE_TEST__.withBatchPrefix('X', 3, 1, t)).toBe('console.batch(3) [2/3] X');

    expect(__HTTP_CONSOLE_TEST__.actionForTronPath('/wallet/getaccount', t)).toBe('console.tron.getaccount');
    expect(__HTTP_CONSOLE_TEST__.actionForTronPath('///WALLET/GETACCOUNT', t)).toBe('console.tron.getaccount');
    expect(__HTTP_CONSOLE_TEST__.actionForTronPath('wallet/unknown', t)).toBe('console.action_unknown');

    expect(__HTTP_CONSOLE_TEST__.actionForHttp('OPTIONS', '/x', t)).toBe('console.intent_preflight');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('', '/', t)).toBe('console.intent_load_page');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('GET', '/index.html', t)).toBe('console.intent_load_page');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('GET', '/app.js', t)).toBe('console.intent_load_asset');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('GET', '/image.PNG', t)).toBe('console.intent_load_asset');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('POST', '/api', t)).toBe('console.intent_http_request');
    expect(__HTTP_CONSOLE_TEST__.actionForHttp('', '', t)).toBe('console.intent_load_page');
  });
});
