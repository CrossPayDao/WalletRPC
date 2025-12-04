
import { ChainData } from '../../features/wallet/types';

export const tronNile: ChainData = {
  id: 2494104990,
  name: 'Tron Nile Testnet',
  defaultRpcUrl: 'https://nile.trongrid.io',
  currencySymbol: 'TRX',
  explorerUrl: 'https://nile.tronscan.org',
  chainType: 'TRON',
  isTestnet: true,
  tokens: [
    { symbol: 'USDT', name: 'Tether USD (BTT)', address: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', decimals: 6 }
  ]
};
