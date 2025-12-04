
import { ChainConfig, SafeContracts } from './types';
import { SUPPORTED_CHAINS } from '../../data/chains';

// --- Safe Configuration ---

export const DEFAULT_SAFE_CONFIG: SafeContracts = {
  proxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
  singleton: "0x3E5c63644E683549055b9Be8653de26E0B4CD36E",
  fallbackHandler: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"
};

export const CHAIN_SAFE_CONFIGS: Record<number, SafeContracts> = {
  // BTT Donau Testnet
  1029: {
    proxyFactory: "0xa7b8d2fF03627b353694e870eA07cE21C29DccF0",
    singleton: "0x91fC153Addb1dAB12FDFBa7016CFdD24345D354b",
    fallbackHandler: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"
  }
};

export const getSafeConfig = (chainId: number): SafeContracts => {
  return CHAIN_SAFE_CONFIGS[chainId] || DEFAULT_SAFE_CONFIG;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const SENTINEL_OWNERS = "0x0000000000000000000000000000000000000001";

// --- ABIs ---

export const SAFE_ABI = [
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function nonce() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)",
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 _threshold)",
  "function changeThreshold(uint256 _threshold)"
];

export const PROXY_FACTORY_ABI = [
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ProxyCreation(address indexed proxy, address indexed singleton)"
];

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

// --- Config Merger ---

/**
 * Merges the modular chain data into the application's configuration format.
 */
export const DEFAULT_CHAINS: ChainConfig[] = SUPPORTED_CHAINS.map(chainData => ({
  ...chainData,
  tokens: chainData.tokens.map(t => ({ ...t, isCustom: false })), // Ensure tokens are marked as non-custom default
  isCustom: false
}));
