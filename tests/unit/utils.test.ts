import { describe, expect, it } from 'vitest';
import { getActiveExplorer, getExplorerAddressLink, getExplorerLink, normalizeHex } from '../../features/wallet/utils';
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
});
