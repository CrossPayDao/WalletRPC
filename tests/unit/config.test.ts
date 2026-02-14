import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAINS, DEFAULT_SAFE_CONFIG, SENTINEL_OWNERS, ZERO_ADDRESS, getSafeConfig } from '../../features/wallet/config';
import { ChainConfig } from '../../features/wallet/types';

describe('wallet config', () => {
  it('当链未提供 safeContracts 时回退到默认配置', () => {
    const chain = {
      id: 999,
      name: 'Custom',
      defaultRpcUrl: 'https://rpc.local',
      publicRpcUrls: [],
      currencySymbol: 'ETH',
      chainType: 'EVM',
      tokens: []
    } as ChainConfig;

    expect(getSafeConfig(chain)).toEqual(DEFAULT_SAFE_CONFIG);
  });

  it('当链提供 safeContracts 时优先使用链配置', () => {
    const customSafe = {
      proxyFactory: '0x1111111111111111111111111111111111111111',
      singleton: '0x2222222222222222222222222222222222222222',
      fallbackHandler: '0x3333333333333333333333333333333333333333'
    };

    const chain = {
      id: 1000,
      name: 'Custom2',
      defaultRpcUrl: 'https://rpc.local',
      publicRpcUrls: [],
      currencySymbol: 'ETH',
      chainType: 'EVM',
      tokens: [],
      safeContracts: customSafe
    } as ChainConfig;

    expect(getSafeConfig(chain)).toEqual(customSafe);
  });

  it('默认链配置和默认 token 都带有 isCustom=false', () => {
    expect(DEFAULT_CHAINS.length).toBeGreaterThan(0);
    DEFAULT_CHAINS.forEach((chain) => {
      expect(chain.isCustom).toBe(false);
      chain.tokens.forEach((token) => {
        expect(token.isCustom).toBe(false);
      });
    });
  });

  it('地址常量保持预期值', () => {
    expect(ZERO_ADDRESS).toBe('0x0000000000000000000000000000000000000000');
    expect(SENTINEL_OWNERS).toBe('0x0000000000000000000000000000000000000001');
  });
});
