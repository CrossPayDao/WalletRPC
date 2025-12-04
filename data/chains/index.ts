
import { ethereum } from './ethereum';
import { bsc } from './bsc';
import { bttMainnet } from './btt_mainnet';
import { bttDonau } from './btt_donau';
import { tronMainnet } from './tron';
import { tronNile } from './tron_nile';

// Register new chains here
export const SUPPORTED_CHAINS = [
  ethereum,
  bsc,
  bttMainnet,
  bttDonau,
  tronMainnet,
  tronNile
];
