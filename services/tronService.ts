
import { ethers } from 'ethers';
import bs58 from 'bs58';

/**
 * 【架构设计：轻量级 Tron 协议适配器】
 * 背景：Tron 虽然兼容 EVM 虚拟机，但其地址编码 (Base58) 和 RPC 接口 (HTTP 而非 JSON-RPC) 与以太坊完全不同。
 * 目的：不引入庞大的 TronWeb 库（减少包体积约 2MB），直接利用 ethers.js 的基础库实现核心逻辑。
 * 好处：极速加载、低内存占用、高可控性。
 */
export const TronService = {
  // --- 地址处理逻辑 ---
  
  /**
   * 【性能优化：原生校验逻辑】
   * 背景：Tron 地址包含 4 字节的 SHA256 校验和。
   * 逻辑：
   * 1. 检查长度 (34) 和前缀 (T)。
   * 2. Base58 解码。
   * 3. 提取前 21 字节计算两次 SHA256，对比后 4 字节。
   * 优势：在 UI 输入拦截时实现零延迟校验，不依赖网络请求。
   */
  isValidBase58Address: (address: string): boolean => {
    try {
      if (typeof address !== 'string' || address.length !== 34 || !address.startsWith('T')) {
        return false;
      }
      const bytes = bs58.decode(address);
      if (bytes.length !== 25) return false;
      if (bytes[0] !== 0x41) return false;

      const payload = bytes.slice(0, 21);
      const checksum = bytes.slice(21);
      
      const hash0 = ethers.getBytes(ethers.sha256(payload));
      const hash1 = ethers.getBytes(ethers.sha256(hash0));
      const expectedChecksum = hash1.slice(0, 4);

      return checksum.every((val, i) => val === expectedChecksum[i]);
    } catch (e) {
      return false;
    }
  },

  /**
   * 【转换逻辑：Base58 <-> Hex】
   * 目的：Tron 内部虚拟机使用的是 0x41 前缀 of 21 字节地址。
   * 搭配：用于在 API 请求前转换用户可见的 T 地址。
   */
  toHexAddress: (base58Addr: string): string => {
    if (!base58Addr) return "";
    if (base58Addr.startsWith("0x")) {
        return base58Addr.length === 42 ? "0x41" + base58Addr.slice(2) : base58Addr;
    }
    try {
      const bytes = bs58.decode(base58Addr);
      return ethers.hexlify(bytes.slice(0, -4)); 
    } catch (e) { return ""; }
  },

  fromHexAddress: (hexAddr: string): string => {
    if (!hexAddr.startsWith("0x")) hexAddr = "0x" + hexAddr;
    if (hexAddr.substring(0, 4) !== "0x41") hexAddr = "0x41" + hexAddr.substring(2);
    
    const bytes = ethers.getBytes(hexAddr);
    const hash0 = ethers.getBytes(ethers.sha256(bytes));
    const hash1 = ethers.getBytes(ethers.sha256(hash0));
    const checksum = hash1.slice(0, 4);
    
    const finalBytes = new Uint8Array(bytes.length + 4);
    finalBytes.set(bytes);
    finalBytes.set(checksum, bytes.length);
    return bs58.encode(finalBytes);
  },

  /**
   * 【关键逻辑：多链共用私钥的地址派生】
   * 背景：用户导入一套助记词，我们需要生成两套地址。
   * 优势：简化用户负担，一套密钥管理多链资产。
   */
  addressFromPrivateKey: (privateKey: string): string => {
    const w = new ethers.Wallet(privateKey);
    const hexAddr = "0x41" + w.address.slice(2);
    return TronService.fromHexAddress(hexAddr);
  },

  // --- API 与交易逻辑 ---

  rpcCall: async (host: string, path: string, payload: any) => {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  /**
   * 获取原生代币余额 (TRX)
   */
  getBalance: async (host: string, addressBase58: string): Promise<string> => {
    const res = await TronService.rpcCall(host, '/wallet/getaccount', {
      address: TronService.toHexAddress(addressBase58)
    });
    return (res.balance || 0).toString();
  },

  /**
   * 【TRC20 余额获取优化】
   * 逻辑：构造 triggerconstantcontract 请求。
   * 痛点：Tron 不支持标准的 eth_call。
   * 解决：手动拼接 32 字节对齐的参数（Padding），模拟合约调用。
   */
  getTrc20Balance: async (host: string, addressBase58: string, contractBase58: string): Promise<string> => {
    const ownerHex = TronService.toHexAddress(addressBase58);
    const contractHex = TronService.toHexAddress(contractBase58);
    const addrParam = "0".repeat(24) + ownerHex.slice(4); 
    
    const res = await TronService.rpcCall(host, '/wallet/triggerconstantcontract', {
      owner_address: ownerHex,
      contract_address: contractHex,
      function_selector: 'balanceOf(address)',
      parameter: addrParam
    });
    
    if (res.result?.result && res.constant_result?.[0]) {
       return BigInt("0x" + res.constant_result[0]).toString();
    }
    return "0";
  },

  signTransaction: async (privateKey: string, transaction: any) => {
    const wallet = new ethers.Wallet(privateKey);
    const txID = transaction.txID;
    // 使用 Ethers 的签名能力处理 Tron 的交易 Hash
    const signatureObj = wallet.signingKey.sign("0x" + txID);
    return {
      ...transaction,
      signature: [signatureObj.serialized]
    };
  }
};