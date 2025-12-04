
import { ChainData } from '../../features/wallet/types';

export const ethereum: ChainData = {
  id: 1,
  name: 'Ethereum Mainnet',
  defaultRpcUrl: 'https://eth.llamarpc.com',
  currencySymbol: 'ETH',
  explorerUrl: 'https://etherscan.io',
  chainType: 'EVM',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  ]
};
