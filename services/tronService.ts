
import { ethers } from 'ethers';
import bs58 from 'bs58';

const bytesToHex = (bytes: ArrayLike<number>): string => {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
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
      const response = await fetch(`${baseUrl}/wallet/getaccount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: TronService.toHexAddress(address), 
          visible: false 
        })
      });
      const account = await response.json();
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
      
      const response = await fetch(`${baseUrl}/wallet/triggerconstantcontract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_address: ownerHex,
          contract_address: contractHex,
          function_selector: "balanceOf(address)",
          parameter: parameter,
          visible: false
        })
      });
      
      const result = await response.json();
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
      const response = await fetch(`${baseUrl}/walletsolidity/gettransactioninfobyid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: txid })
      });
      const result = await response.json();
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
    const ownerAddress = TronService.addressFromPrivateKey(privateKey);
    const ownerHex = TronService.toHexAddress(ownerAddress).replace('0x', '');
    const toHex = TronService.toHexAddress(to).replace('0x', '');

    try {
      let transaction: any;

      if (contractAddress) {
        // TRC20 Transfer
        const contractHex = TronService.toHexAddress(contractAddress).replace('0x', '');
        const functionSelector = "transfer(address,uint256)";
        const parameter = toHex.padStart(64, '0') + amount.toString(16).padStart(64, '0');

        const response = await fetch(`${baseUrl}/wallet/triggersmartcontract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_address: ownerHex,
            contract_address: contractHex,
            function_selector: functionSelector,
            parameter: parameter,
            fee_limit: 100000000, // 100 TRX limit
            visible: false
          })
        });
        const result = await response.json();
        if (!result.result?.result) throw new Error(result.result?.message || "Trigger contract failed");
        transaction = result.transaction;
      } else {
        // Native TRX Transfer
        const amountNumber = Number(amount);
        if (!Number.isSafeInteger(amountNumber) || amountNumber < 0) {
          throw new Error("TRX amount exceeds safe integer range");
        }
        const response = await fetch(`${baseUrl}/wallet/createtransaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_address: ownerHex,
            to_address: toHex,
            amount: amountNumber,
            visible: false
          })
        });
        transaction = await response.json();
      }

      if (transaction.Error) throw new Error(transaction.Error);

      // 本地签名
      const signingKey = new ethers.SigningKey(privateKey);
      const signature = signingKey.sign("0x" + transaction.txID);
      // TRON 签名格式：[r, s, v] 拼接，v 为 0 或 1
      const sigHex = signature.r.slice(2) + signature.s.slice(2) + (signature.v - 27).toString(16).padStart(2, '0');
      
      const signedTx = { ...transaction, signature: [sigHex] };

      // 广播
      const broadcastResponse = await fetch(`${baseUrl}/wallet/broadcasttransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signedTx)
      });
      const broadcastResult = await broadcastResponse.json();

      if (broadcastResult.result) {
        return { success: true, txid: transaction.txID };
      } else {
        return { success: false, error: broadcastResult.message || "Broadcast failed" };
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
      const response = await fetch(`${baseUrl}/wallet/getnowblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
      const data = await response.json();
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
