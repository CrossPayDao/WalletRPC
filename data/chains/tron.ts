
import { ChainData } from '../../features/wallet/types';

export const tronMainnet: ChainData = {
  id: 728126428,
  name: 'Tron Mainnet',
  defaultRpcUrl: 'https://api.trongrid.io',
  currencySymbol: 'TRX',
  explorerUrl: 'https://tronscan.org',
  chainType: 'TRON',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 }
  ]
};
