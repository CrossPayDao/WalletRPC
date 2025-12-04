
import { ChainData } from '../../features/wallet/types';

export const bsc: ChainData = {
  id: 56,
  name: 'BNB Smart Chain',
  defaultRpcUrl: 'https://binance.llamarpc.com',
  currencySymbol: 'BNB',
  explorerUrl: 'https://bscscan.com',
  chainType: 'EVM',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'BUSD', name: 'Binance USD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
  ]
};
