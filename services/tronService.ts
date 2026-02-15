
import { ethers } from 'ethers';
import bs58 from 'bs58';

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
      console.error("Tron getBalance failed", e);
      return 0n; 
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
      console.error("TRC20 balance fetch failed", e);
      return 0n;
    }
  },

  /**
   * 查询交易是否已上链以及执行结果
   */
  getTransactionInfo: async (host: string, txid: string): Promise<{ found: boolean; success?: boolean }> => {
    try {
      const baseUrl = TronService.normalizeHost(host);
      const result = await postJson<any>(`${baseUrl}/walletsolidity/gettransactioninfobyid`, { value: txid });
      if (!result || Object.keys(result).length === 0) return { found: false };
      const receiptResult = result.receipt?.result;
      if (receiptResult && receiptResult !== 'SUCCESS') return { found: true, success: false };
      return { found: true, success: true };
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
      console.error("TRON send failed", e);
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
