
import { ChainData } from '../../features/wallet/types';

export const bttMainnet: ChainData = {
  id: 199,
  name: 'BitTorrent Chain',
  defaultRpcUrl: 'https://rpc.bittorrentchain.io',
  publicRpcUrls: [
    'https://rpc.bittorrentchain.io',
    'https://bttc.drpc.org',
    'https://1rpc.io/btt'
  ],
  currencySymbol: 'BTT',
  explorers: [
    {
      name: 'BttcScan',
      key: 'bttcscan',
      url: 'https://bttcscan.com',
      txPath: 'https://bttcscan.com/tx/{txid}',
      addressPath: 'https://bttcscan.com/address/{address}'
    }
  ],
  chainType: 'EVM',
  tokens: [
    { symbol: 'USDT', name: 'Tether USD', address: '0xdb28719f7f938507fe92955f7c73c82926956f6a', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', address: '0x935faa2fcec6ea4233032758537804258d2728b7', decimals: 6 },
    { symbol: 'USDD', name: 'Decentralized USD', address: '0x17f235fd5974318e4e2a5e37919a209f7c37a6d1', decimals: 18 }
  ]
};
