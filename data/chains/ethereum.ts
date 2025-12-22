
import { ChainData } from '../../features/wallet/types';

export const ethereum: ChainData = {
  id: 1,
  name: 'Ethereum Mainnet',
  defaultRpcUrl: 'https://eth.llamarpc.com',
  publicRpcUrls: [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://1rpc.io/eth'
  ],
  currencySymbol: 'ETH',
  explorers: [
    {
      name: 'Etherscan',
      key: 'etherscan',
      url: 'https://etherscan.io',
      txPath: 'https://etherscan.io/tx/{txid}',
      addressPath: 'https://etherscan.io/address/{address}'
    }
  ],
  chainType: 'EVM',
  safeContracts: {
    proxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    singleton: "0x3E5c63644E683549055b9Be8653de26E0B4CD36E",
    fallbackHandler: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"
  },
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  ]
};
