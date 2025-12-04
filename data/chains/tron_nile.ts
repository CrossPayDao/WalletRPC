

import { ChainData } from '../../features/wallet/types';

export const tronNile: ChainData = {
  id: 2494104990,
  name: 'Tron Nile Testnet',
  defaultRpcUrl: 'https://nile.trongrid.io',
  publicRpcUrls: [
    'https://nile.trongrid.io',
    'https://nile.trongrid.io/jsonrpc'
  ],
  currencySymbol: 'TRX',
  explorers: [
    {
      name: 'TronScan (Nile)',
      key: 'tronscan_nile',
      url: 'https://nile.tronscan.org',
      txPath: 'https://nile.tronscan.org/#/transaction/{txid}',
      addressPath: 'https://nile.tronscan.org/#/address/{address}'
    }
  ],
  chainType: 'TRON',
  isTestnet: true,
  tokens: [
    { symbol: 'USDT', name: 'Tether USD (BTT)', address: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', decimals: 6 }
  ]
};