
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { devError } from './logger';
import { TronResourceType } from '../features/wallet/types';
import { TRON_WITNESS_WHITELIST } from '../features/wallet/tronWitnessWhitelist';

const bytesToHex = (bytes: ArrayLike<number>): string => {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const fetchWithTimeout = async (input: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch { /* ignore */ }
      reject(new Error('Request timeout'));
    }, timeoutMs);
  });

  try {
    const req = fetch(input, { ...init, signal: controller.signal });
    return await Promise.race([req, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const postJson = async <T>(url: string, body: unknown, timeoutMs: number = 8000): Promise<T> => {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
};

const postJsonFirstSuccess = async <T>(
  requests: Array<{ url: string; body: unknown; timeoutMs?: number }>
): Promise<T> => {
  let lastError: unknown = null;
  for (const req of requests) {
    try {
      return await postJson<T>(req.url, req.body, req.timeoutMs);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All endpoint attempts failed');
};

type TronTxResult = { success: boolean; txid?: string; error?: string };

const toTxPayload = (raw: any): any => {
  if (!raw) throw new Error('Empty transaction payload');
  if (raw.transaction) return raw.transaction;
  if (raw.txID && raw.raw_data) return raw;
  throw new Error('Invalid transaction payload');
};

const parseApiError = (raw: any): string => {
  const msg = raw?.message || raw?.Error || raw?.code || 'Unknown error';
  const decoded = tryDecodeHexAscii(msg) || tryDecodeBase64Ascii(msg);
  return decoded || String(msg);
};

const signAndBroadcast = async (baseUrl: string, privateKey: string, txPayload: any): Promise<TronTxResult> => {
  const transaction = toTxPayload(txPayload);
  if (!transaction.txID) throw new Error('Missing txID');

  const signingKey = new ethers.SigningKey(privateKey);
  const signature = signingKey.sign(`0x${transaction.txID}`);
  const sigHex =
    signature.r.slice(2) + signature.s.slice(2) + (signature.v - 27).toString(16).padStart(2, '0');
  const signedTx = { ...transaction, signature: [sigHex] };
  const broadcastResult = await postJson<any>(`${baseUrl}/wallet/broadcasttransaction`, signedTx);

  if (broadcastResult.result) {
    return { success: true, txid: transaction.txID };
  }
  return { success: false, error: parseApiError(broadcastResult) };
};

const toResource = (resource: TronResourceType): 'ENERGY' | 'BANDWIDTH' => {
  return resource === 'ENERGY' ? 'ENERGY' : 'BANDWIDTH';
};

const toSafeAmountNumber = (amount: bigint): number => {
  const n = Number(amount);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error('Amount must be a positive safe integer');
  }
  return n;
};

const TRON_WITNESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const tronWitnessCache = new Map<
  string,
  {
    expiresAt: number;
    witnesses: Array<{ address: string; name: string; website?: string; description?: string; isActive: boolean }>;
  }
>();

const tryDecodeHexAscii = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  const hex = s.startsWith('0x') ? s.slice(2) : s;
  if (!hex || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    const text = new TextDecoder().decode(bytes);
    // only accept printable-ish strings
    if (/^[\x09\x0A\x0D\x20-\x7E]{1,}$/.test(text)) return text;
    return null;
  } catch {
    return null;
  }
};

const tryDecodeBase64Ascii = (s: unknown): string | null => {
  if (typeof s !== 'string' || !s) return null;
  try {
    let bytes: Uint8Array;
    if (typeof atob === 'function') {
      const bin = atob(s);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (typeof Buffer !== 'undefined') {
      bytes = Uint8Array.from(Buffer.from(s, 'base64'));
    } else {
      return null;
    }
    const text = new TextDecoder().decode(bytes);
    if (/^[\x09\x0A\x0D\x20-\x7E]{1,}$/.test(text)) return text;
    return null;
  } catch {
    return null;
  }
};

const clearWitnessCache = () => {
  tronWitnessCache.clear();
};

const getWitnessCacheSize = () => {
  return tronWitnessCache.size;
};

/**
 * 【设计亮点：轻量级协议桥接器 (Adapter Pattern)】
 * 
 * 背景：Tron 与以太坊同为 EVM 兼容，但账户体系（Base58）与底层 RPC 差异极大。
 * 意义：本项目不使用庞大的 TronWeb 官方库，而是基于 ethers.js 基础加密包手动实现协议转换和交易签名。
 */
export const TronService = {
  normalizeHost: (host: string): string => {
    let baseUrl = (host || '').trim();
    if (!baseUrl) return '';

    // Normalize TronGrid JSON-RPC urls to the REST base used by this client.
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (baseUrl.endsWith('/jsonrpc')) {
      baseUrl = baseUrl.slice(0, -'/jsonrpc'.length);
    }
    baseUrl = baseUrl.replace(/\/+$/, '');
    return baseUrl;
  },
  
  isValidBase58Address: (address: string): boolean => {
    try {
      if (typeof address !== 'string' || address.length !== 34 || !address.startsWith('T')) return false;
      const bytes = bs58.decode(address);
      if (bytes.length !== 25) return false;
      
      const payload = bytes.slice(0, 21);
      const checksum = bytes.slice(21);
      const firstHash = ethers.sha256(bytesToHex(payload));
      const hash = ethers.getBytes(ethers.sha256(firstHash));
      const expectedChecksum = hash.slice(0, 4);
      return checksum.every((val, i) => val === expectedChecksum[i]);
    } catch (e) { return false; }
  },

  /**
   * 获取 TRX 余额
   */
  getBalance: async (host: string, address: string): Promise<bigint> => {
    try {
      const baseUrl = TronService.normalizeHost(host);
      const account = await postJson<{ balance?: number | string }>(
        `${baseUrl}/wallet/getaccount`,
        {
          address: TronService.toHexAddress(address),
          visible: false
        }
      );
      return BigInt(account.balance || 0);
    } catch (e) { 
      devError("Tron getBalance failed", e);
      // Important: do not masquerade failures as 0 balance. Callers should handle the error
      // and decide whether to keep last-known values or show a loading/error state.
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  /**
   * 获取 TRC20 代币余额 (如 USDT)
   */
  getTRC20Balance: async (host: string, contractAddress: string, ownerAddress: string): Promise<bigint> => {
    try {
      const baseUrl = TronService.normalizeHost(host);
      const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
      const contractHex = TronService.toHexAddress(contractAddress).replace('0x', '');
      
      const parameter = ownerHex.padStart(64, '0');
      
      const result = await postJson<any>(`${baseUrl}/wallet/triggerconstantcontract`, {
        owner_address: ownerHex,
        contract_address: contractHex,
        function_selector: "balanceOf(address)",
        parameter: parameter,
        visible: false
      });
      if (result.constant_result && result.constant_result.length > 0) {
        return BigInt('0x' + result.constant_result[0]);
      }
      return 0n;
    } catch (e) {
      devError("TRC20 balance fetch failed", e);
      // Same reasoning as getBalance(): a fetch failure must not look like a real 0 balance.
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  getWitnessWhitelist: () => {
    return TRON_WITNESS_WHITELIST.filter((w) => w.isActive);
  },

  getNodeWitnesses: async (
    host: string
  ): Promise<Array<{ address: string; name: string; website?: string; description?: string; isActive: boolean }>> => {
    const baseUrl = TronService.normalizeHost(host);
    const now = Date.now();
    const cached = tronWitnessCache.get(baseUrl);
    if (cached && cached.expiresAt > now) {
      return cached.witnesses;
    }
    try {
      const data = await postJsonFirstSuccess<any>([
        { url: `${baseUrl}/wallet/listwitnesses`, body: {} },
        { url: `${baseUrl}/wallet/listWitnesses`, body: {} }
      ]);
      const list = Array.isArray(data?.witnesses) ? data.witnesses : [];
      const witnesses = list
        .map((w: any) => {
          const rawAddr = String(w?.address || '');
          const addr = rawAddr.startsWith('T')
            ? rawAddr
            : TronService.fromHexAddress(`0x${rawAddr.replace(/^0x/i, '')}`);
          const url = typeof w?.url === 'string' ? w.url : '';
          const label = url || `${addr.slice(0, 6)}...${addr.slice(-4)}`;
          return {
            address: addr,
            name: label,
            website: url || undefined,
            description: 'RPC witness list',
            isActive: true
          };
        })
        .filter((w: any) => TronService.isValidBase58Address(w.address));
      if (witnesses.length > 0) {
        tronWitnessCache.set(baseUrl, {
          expiresAt: now + TRON_WITNESS_CACHE_TTL_MS,
          witnesses
        });
      }
      return witnesses;
    } catch (e) {
      devError('TRON getNodeWitnesses failed', e);
      if (cached?.witnesses?.length) return cached.witnesses;
      return [];
    }
  },

  getAccountResources: async (
    host: string,
    address: string
  ): Promise<{
    energyLimit: number;
    energyUsed: number;
    freeNetLimit: number;
    freeNetUsed: number;
    netLimit: number;
    netUsed: number;
    tronPowerLimit: number;
    tronPowerUsed: number;
  }> => {
    const baseUrl = TronService.normalizeHost(host);
    const result = await postJson<any>(`${baseUrl}/wallet/getaccountresource`, {
      address: TronService.toHexAddress(address),
      visible: false
    });
    return {
      energyLimit: Number(result?.EnergyLimit || 0),
      energyUsed: Number(result?.EnergyUsed || 0),
      freeNetLimit: Number(result?.freeNetLimit || 0),
      freeNetUsed: Number(result?.freeNetUsed || 0),
      netLimit: Number(result?.NetLimit || 0),
      netUsed: Number(result?.NetUsed || 0),
      tronPowerLimit: Number(result?.tronPowerLimit || 0),
      tronPowerUsed: Number(result?.tronPowerUsed || 0)
    };
  },

  getCanWithdrawUnfreeze: async (host: string, address: string): Promise<bigint> => {
    const baseUrl = TronService.normalizeHost(host);
    try {
      const result = await postJson<any>(`${baseUrl}/wallet/getcanwithdrawunfreezeamount`, {
        owner_address: TronService.toHexAddress(address).replace('0x', ''),
        visible: false
      });
      return BigInt(result?.amount || 0);
    } catch (e) {
      devError('TRON getCanWithdrawUnfreeze failed', e);
      return 0n;
    }
  },

  stakeResource: async (
    host: string,
    privateKey: string,
    amountSun: bigint,
    resource: TronResourceType
  ): Promise<TronTxResult> => {
    const baseUrl = TronService.normalizeHost(host);
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    if (!ownerHex) return { success: false, error: 'Invalid owner address' };
    try {
      const tx = await postJson<any>(`${baseUrl}/wallet/freezebalancev2`, {
        owner_address: ownerHex,
        frozen_balance: toSafeAmountNumber(amountSun),
        resource: toResource(resource),
        visible: false
      });
      if (tx?.result?.result === false) return { success: false, error: parseApiError(tx) };
      return await signAndBroadcast(baseUrl, privateKey, tx);
    } catch (e: any) {
      devError('TRON stakeResource failed', e);
      return { success: false, error: e?.message || 'stake failed' };
    }
  },

  unstakeResource: async (
    host: string,
    privateKey: string,
    amountSun: bigint,
    resource: TronResourceType
  ): Promise<TronTxResult> => {
    const baseUrl = TronService.normalizeHost(host);
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    if (!ownerHex) return { success: false, error: 'Invalid owner address' };
    try {
      const tx = await postJson<any>(`${baseUrl}/wallet/unfreezebalancev2`, {
        owner_address: ownerHex,
        unfreeze_balance: toSafeAmountNumber(amountSun),
        resource: toResource(resource),
        visible: false
      });
      if (tx?.result?.result === false) return { success: false, error: parseApiError(tx) };
      return await signAndBroadcast(baseUrl, privateKey, tx);
    } catch (e: any) {
      devError('TRON unstakeResource failed', e);
      return { success: false, error: e?.message || 'unstake failed' };
    }
  },

  withdrawUnfreeze: async (host: string, privateKey: string): Promise<TronTxResult> => {
    const baseUrl = TronService.normalizeHost(host);
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    if (!ownerHex) return { success: false, error: 'Invalid owner address' };
    try {
      const tx = await postJson<any>(`${baseUrl}/wallet/withdrawexpireunfreeze`, {
        owner_address: ownerHex,
        visible: false
      });
      if (tx?.result?.result === false) return { success: false, error: parseApiError(tx) };
      return await signAndBroadcast(baseUrl, privateKey, tx);
    } catch (e: any) {
      devError('TRON withdrawUnfreeze failed', e);
      return { success: false, error: e?.message || 'withdraw unfreeze failed' };
    }
  },

  voteWitnesses: async (
    host: string,
    privateKey: string,
    votes: Array<{ address: string; votes: number }>
  ): Promise<TronTxResult> => {
    const baseUrl = TronService.normalizeHost(host);
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    if (!ownerHex) return { success: false, error: 'Invalid owner address' };
    const normalizedVotesHex = votes
      .filter((v) => Number.isFinite(v.votes) && v.votes > 0)
      .map((v) => ({
        vote_address: TronService.toHexAddress(v.address).replace('0x', ''),
        vote_count: Math.floor(v.votes)
      }))
      .filter((v) => !!v.vote_address && v.vote_count > 0);
    const normalizedVotesBase58 = votes
      .filter((v) => Number.isFinite(v.votes) && v.votes > 0)
      .map((v) => ({
        vote_address: v.address,
        vote_count: Math.floor(v.votes)
      }))
      .filter((v) => TronService.isValidBase58Address(v.vote_address) && v.vote_count > 0);
    if (normalizedVotesHex.length === 0) return { success: false, error: 'Vote count must be greater than 0' };
    try {
      const tx = await postJsonFirstSuccess<any>([
        {
          url: `${baseUrl}/wallet/votewitnessaccount`,
          body: {
            owner_address: ownerHex,
            votes: normalizedVotesHex,
            visible: false
          }
        },
        {
          url: `${baseUrl}/wallet/votewitnessaccount`,
          body: {
            owner_address: ownerAddress,
            votes: normalizedVotesBase58,
            visible: true
          }
        }
      ]);
      if (tx?.result?.result === false) return { success: false, error: parseApiError(tx) };
      return await signAndBroadcast(baseUrl, privateKey, tx);
    } catch (e: any) {
      devError('TRON voteWitnesses failed', e);
      return { success: false, error: e?.message || 'vote failed' };
    }
  },

  getVoteStatus: async (
    host: string,
    address: string
  ): Promise<Array<{ address: string; votes: number }>> => {
    const baseUrl = TronService.normalizeHost(host);
    try {
      const account = await postJson<any>(`${baseUrl}/wallet/getaccount`, {
        address: TronService.toHexAddress(address),
        visible: false
      });
      const votes = Array.isArray(account?.votes) ? account.votes : [];
      return votes
        .map((v: any) => ({
          address: TronService.fromHexAddress(`0x${String(v?.vote_address || '')}`),
          votes: Number(v?.vote_count || 0)
        }))
        .filter((v: any) => !!v.address && Number.isFinite(v.votes));
    } catch (e) {
      devError('TRON getVoteStatus failed', e);
      return [];
    }
  },

  getRewardInfo: async (
    host: string,
    address: string
  ): Promise<{ claimableSun: bigint; canClaim: boolean }> => {
    const baseUrl = TronService.normalizeHost(host);
    try {
      const hexAddress = TronService.toHexAddress(address).replace('0x', '');
      const result = await postJsonFirstSuccess<any>([
        {
          url: `${baseUrl}/wallet/getReward`,
          body: { address: hexAddress, visible: false }
        },
        {
          url: `${baseUrl}/wallet/getReward`,
          body: { owner_address: hexAddress, visible: false }
        },
        {
          url: `${baseUrl}/wallet/getReward`,
          body: { address, visible: true }
        }
      ]);
      const reward = BigInt(result?.reward || 0);
      return { claimableSun: reward, canClaim: reward > 0n };
    } catch (e) {
      devError('TRON getRewardInfo failed', e);
      return { claimableSun: 0n, canClaim: false };
    }
  },

  claimReward: async (host: string, privateKey: string): Promise<TronTxResult> => {
    const baseUrl = TronService.normalizeHost(host);
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    if (!ownerHex) return { success: false, error: 'Invalid owner address' };
    try {
      const tx = await postJson<any>(`${baseUrl}/wallet/withdrawbalance`, {
        owner_address: ownerHex,
        visible: false
      });
      if (tx?.result?.result === false) return { success: false, error: parseApiError(tx) };
      return await signAndBroadcast(baseUrl, privateKey, tx);
    } catch (e: any) {
      devError('TRON claimReward failed', e);
      return { success: false, error: e?.message || 'claim reward failed' };
    }
  },

  /**
   * 查询交易是否已上链以及执行结果
   */
  getTransactionInfo: async (host: string, txid: string): Promise<{ found: boolean; success?: boolean }> => {
    try {
      const baseUrl = TronService.normalizeHost(host);
      // Prefer fullnode endpoint first for fresher data, then fallback to solidity endpoint.
      const result = await postJsonFirstSuccess<any>([
        { url: `${baseUrl}/wallet/gettransactioninfobyid`, body: { value: txid } },
        { url: `${baseUrl}/walletsolidity/gettransactioninfobyid`, body: { value: txid } }
      ]);
      if (!result || Object.keys(result).length === 0) return { found: false };

      const receiptResult = String(result.receipt?.result || '').toUpperCase();
      if (receiptResult) {
        if (receiptResult !== 'SUCCESS') return { found: true, success: false };
        return { found: true, success: true };
      }

      // Some TRON nodes return transaction info with blockNumber but without receipt.result.
      // Treat it as confirmed unless a later probe reports explicit failure.
      if (typeof result.blockNumber === 'number' && result.blockNumber >= 0) {
        return { found: true, success: true };
      }

      // Fallback: probe transaction object and read contractRet.
      const tx = await postJson<any>(`${baseUrl}/wallet/gettransactionbyid`, { value: txid });
      if (!tx || Object.keys(tx).length === 0) return { found: false };
      const contractRet = String(tx?.ret?.[0]?.contractRet || '').toUpperCase();
      if (contractRet) {
        if (contractRet === 'SUCCESS') return { found: true, success: true };
        if (contractRet !== 'SUCCESS') return { found: true, success: false };
      }
      // Found but still not finalized.
      return { found: true };
    } catch (e) {
      return { found: false };
    }
  },

  /**
   * 构建、签名并广播交易
   */
  sendTransaction: async (host: string, privateKey: string, to: string, amount: bigint, contractAddress?: string): Promise<{ success: boolean; txid?: string; error?: string }> => {
    const baseUrl = TronService.normalizeHost(host);
    if (!baseUrl) return { success: false, error: 'Missing TRON RPC base URL' };
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    const toHex = TronService.toHexAddress(to).replace('0x', '');
    if (!ownerHex || !toHex) return { success: false, error: 'Invalid address' };

    try {
      let transaction: any;

      if (contractAddress) {
        // TRC20 Transfer
        const contractHex = TronService.toHexAddress(contractAddress).replace('0x', '');
        if (!contractHex) throw new Error('Invalid contract address');
        const functionSelector = "transfer(address,uint256)";
        const parameter = toHex.padStart(64, '0') + amount.toString(16).padStart(64, '0');

        const result = await postJson<any>(`${baseUrl}/wallet/triggersmartcontract`, {
          owner_address: ownerHex,
          contract_address: contractHex,
          function_selector: functionSelector,
          parameter: parameter,
          fee_limit: 100000000, // 100 TRX limit
          visible: false
        });
        if (!result.result?.result) {
          const raw = result.result?.message || result.message || 'Trigger contract failed';
          const decoded = tryDecodeHexAscii(raw) || tryDecodeBase64Ascii(raw);
          throw new Error(decoded || String(raw));
        }
        transaction = result.transaction;
      } else {
        // Native TRX Transfer
        const amountNumber = Number(amount);
        if (!Number.isSafeInteger(amountNumber) || amountNumber < 0) {
          throw new Error("TRX amount exceeds safe integer range");
        }
        transaction = await postJson<any>(`${baseUrl}/wallet/createtransaction`, {
          owner_address: ownerHex,
          to_address: toHex,
          amount: amountNumber,
          visible: false
        });
      }

      if (transaction.Error) throw new Error(transaction.Error);

      // 本地签名
      const signingKey = new ethers.SigningKey(privateKey);
      const signature = signingKey.sign("0x" + transaction.txID);
      // TRON 签名格式：[r, s, v] 拼接，v 为 0 或 1
      const sigHex = signature.r.slice(2) + signature.s.slice(2) + (signature.v - 27).toString(16).padStart(2, '0');
      
      const signedTx = { ...transaction, signature: [sigHex] };

      // 广播
      const broadcastResult = await postJson<any>(`${baseUrl}/wallet/broadcasttransaction`, signedTx);

      if (broadcastResult.result) {
        return { success: true, txid: transaction.txID };
      } else {
        const raw = broadcastResult.message || broadcastResult.code || "Broadcast failed";
        const decoded = tryDecodeHexAscii(raw) || tryDecodeBase64Ascii(raw);
        return { success: false, error: decoded || String(raw) };
      }
    } catch (e: any) {
      devError("TRON send failed", e);
      return { success: false, error: e.message };
    }
  },

  probeRpc: async (host: string): Promise<{ ok: boolean; error?: string }> => {
    const baseUrl = TronService.normalizeHost(host);
    if (!baseUrl) return { ok: false, error: 'Missing TRON RPC base URL' };

    try {
      const data = await postJson<any>(`${baseUrl}/wallet/getnowblock`, {});
      const looksLikeBlock = !!(data && (data.blockID || data.block_header || data.block_header?.raw_data));
      return looksLikeBlock ? { ok: true } : { ok: false, error: 'Unexpected response' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, error: msg };
    }
  },

  addressFromPrivateKey: (privateKey: string): string => {
    const w = new ethers.Wallet(privateKey);
    const hexAddr = "0x41" + w.address.slice(2);
    return TronService.fromHexAddress(hexAddr);
  },

  toHexAddress: (base58Addr: string): string => {
    if (!base58Addr || base58Addr.startsWith("0x")) return base58Addr;
    try {
      const bytes = bs58.decode(base58Addr);
      if (bytes.length !== 25) return "";
      return bytesToHex(bytes.slice(0, -4));
    } catch (e) { return ""; }
  },

  fromHexAddress: (hexAddr: string): string => {
    if (!hexAddr.startsWith("0x")) hexAddr = "0x" + hexAddr;
    const bytes = ethers.getBytes(hexAddr.substring(0, 4) === "0x41" ? hexAddr : "0x41" + hexAddr.substring(2));
    const firstHash = ethers.sha256(bytesToHex(bytes));
    const hash = ethers.getBytes(ethers.sha256(firstHash));
    const checksum = hash.slice(0, 4);
    const finalBytes = new Uint8Array(bytes.length + 4);
    finalBytes.set(bytes);
    finalBytes.set(checksum, bytes.length);
    return bs58.encode(finalBytes);
  }
};

export const __TRON_TEST__ = {
  bytesToHex,
  fetchWithTimeout,
  postJson,
  postJsonFirstSuccess,
  toTxPayload,
  parseApiError,
  signAndBroadcast,
  toResource,
  toSafeAmountNumber,
  tryDecodeHexAscii,
  tryDecodeBase64Ascii,
  clearWitnessCache,
  getWitnessCacheSize
};
