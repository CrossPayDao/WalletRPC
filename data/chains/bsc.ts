
import { ChainData } from '../../features/wallet/types';

export const bsc: ChainData = {
  id: 56,
  name: 'BNB Smart Chain',
  defaultRpcUrl: 'https://binance.llamarpc.com',
  publicRpcUrls: [
    'https://binance.llamarpc.com',
    'https://bsc-dataseed.binance.org',
    'https://rpc.ankr.com/bsc',
    'https://1rpc.io/bnb'
  ],
  currencySymbol: 'BNB',
  explorers: [
    {
      name: 'BscScan',
      key: 'bscscan',
      url: 'https://bscscan.com',
      txPath: 'https://bscscan.com/tx/{txid}',
      addressPath: 'https://bscscan.com/address/{address}'
    }
  ],
  chainType: 'EVM',
  safeContracts: {
    proxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    singleton: "0x3E5c63644E683549055b9Be8653de26E0B4CD36E",
    fallbackHandler: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"
  },
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'BUSD', name: 'Binance USD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
  ]
};
