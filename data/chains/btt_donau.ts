
import { ChainData } from '../../features/wallet/types';

export const bttDonau: ChainData = {
  id: 1029,
  name: 'BTT Donau Testnet',
  defaultRpcUrl: 'https://pre-rpc.bt.io/',
  publicRpcUrls: [
    'https://pre-rpc.bt.io/',
    'https://donau.bttc.network'
  ],
  currencySymbol: 'BTT',
  explorers: [
    {
      name: 'BTTCScan',
      key: 'bttcscan',
      url: 'https://testnet.bttcscan.com',
      txPath: 'https://testnet.bttcscan.com/tx/{txid}',
      addressPath: 'https://testnet.bttcscan.com/address/{address}'
    }
  ],
  chainType: 'EVM',
  isTestnet: true,
  gasLimits: {
    nativeTransfer: 100000,
    erc20Transfer: 200000,
    safeExec: 800000,
    safeSetup: 3000000
  },
  safeContracts: {
    proxyFactory: "0xa7b8d2fF03627b353694e870eA07cE21C29DccF0",
    singleton: "0x91fC153Addb1dAB12FDFBa7016CFdD24345D354b",
    fallbackHandler: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"
  },
  tokens: [
    { symbol: 'USDT_b', name: 'USDT (BSC)', address: '0x834982c9B0690ED7CA35e10b18887C26c25CdC82', decimals: 6 },
    { symbol: 'USDT_t', name: 'USDT (TRON)', address: '0x6d96aeae27af0cafc53f4f0ad1e27342f384d56d', decimals: 6 },
    { symbol: 'USDT_e', name: 'USDT (ETH)', address: '0xDf095861F37466986F70942468f7601F7098D712', decimals: 6 }
  ]
};
