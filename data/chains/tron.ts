

import { ChainData } from '../../features/wallet/types';

export const tronMainnet: ChainData = {
  id: 728126428,
  name: 'Tron Mainnet',
  defaultRpcUrl: 'https://api.trongrid.io',
  publicRpcUrls: [
    'https://api.trongrid.io',
    'https://api.trongrid.io/jsonrpc'
  ],
  currencySymbol: 'TRX',
  explorers: [
    {
      name: 'TronScan',
      key: 'tronscan',
      url: 'https://tronscan.org',
      txPath: 'https://tronscan.org/#/transaction/{txid}',
      addressPath: 'https://tronscan.org/#/address/{address}'
    }
  ],
  chainType: 'TRON',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 }
  ]
};