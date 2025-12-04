
import { ethereum } from './ethereum';
import { bsc } from './bsc';
import { bttMainnet } from './btt_mainnet';
import { bttDonau } from './btt_donau';
import { tronMainnet } from './tron';
import { tronNile } from './tron_nile';

// Register new chains here
// The first chain in this list is the default chain used on startup
export const SUPPORTED_CHAINS = [
  bttMainnet,
  ethereum,
  bsc,
  tronMainnet,
  tronNile,
  bttDonau
];
