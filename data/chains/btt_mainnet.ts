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
    { symbol: 'USDT_b', name: 'CPcash Peg Binance USDT', address: '0xDe8EC37078F6937BE2063daa0851448657D71C21', decimals: 18 },
    { symbol: 'USDT_e', name: 'CPcash Peg Ethereum USDT', address: '0x1B4b51597afA971F7211bdeEC5e00a0Fd9900B79', decimals: 18 },
    { symbol: 'USDT_t', name: 'CPcash Peg Tron USDT', address: '0x0000000e2605a3eC27C914db851010938aAA6DEa', decimals: 18 }
  ]
};