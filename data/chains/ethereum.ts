

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
    },
    {
      name: 'OKLink',
      key: 'oklink',
      url: 'https://www.oklink.com/ethereum',
      txPath: 'https://www.oklink.com/ethereum/tx/{txid}',
      addressPath: 'https://www.oklink.com/zh-hans/ethereum/address/{address}'
    }
  ],
  chainType: 'EVM',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  ]
};