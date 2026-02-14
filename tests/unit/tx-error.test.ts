import { describe, expect, it } from 'vitest';
import { handleTxError } from '../../features/wallet/utils';

describe('handleTxError', () => {
  it('映射常见 ethers 错误码', () => {
    expect(handleTxError({ code: 'INSUFFICIENT_FUNDS' })).toContain('Insufficient funds');
    expect(handleTxError({ code: 'NONCE_EXPIRED' })).toContain('Nonce');
    expect(handleTxError({ code: 'ACTION_REJECTED' })).toContain('rejected');
  });

  it('映射 Safe 特定错误码', () => {
    expect(handleTxError({ message: 'execution reverted: GS013' })).toContain('Execution reverted');
    expect(handleTxError({ message: 'GS026' })).toContain('GS026');
  });

  it('兜底返回 message 并截断', () => {
    const long = 'x'.repeat(200);
    expect(handleTxError({ message: long }).length).toBeLessThanOrEqual(153);
  });
});
