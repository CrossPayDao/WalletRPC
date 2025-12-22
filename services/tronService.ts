
import { ethers } from 'ethers';
import bs58 from 'bs58';

export const TronService = {
  // Address Utilities
  
  /**
   * Validates a Tron Base58 address (starts with T, length 34, valid checksum)
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

      return checksum[0] === expectedChecksum[0] &&
             checksum[1] === expectedChecksum[1] &&
             checksum[2] === expectedChecksum[2] &&
             checksum[3] === expectedChecksum[3];
    } catch (e) {
      return false;
    }
  },

  toHexAddress: (base58Addr: string): string => {
    if (!base58Addr) return "";
    if (base58Addr.startsWith("0x")) {
        if (base58Addr.length === 42) {
            return "0x41" + base58Addr.slice(2);
        }
        return base58Addr;
    }
    try {
      const bytes = bs58.decode(base58Addr);
      const hex = ethers.hexlify(bytes.slice(0, -4)); 
      return hex; 
    } catch (e) { return ""; }
  },

  fromHexAddress: (hexAddr: string): string => {
    if (!hexAddr.startsWith("0x")) hexAddr = "0x" + hexAddr;
    if (hexAddr.length < 42) return ""; 
    if (hexAddr.substring(0, 4) !== "0x41") {
       hexAddr = "0x41" + hexAddr.substring(2);
    }
    const bytes = ethers.getBytes(hexAddr);
    const hash0 = ethers.getBytes(ethers.sha256(bytes));
    const hash1 = ethers.getBytes(ethers.sha256(hash0));
    const checksum = hash1.slice(0, 4);
    const finalBytes = new Uint8Array(bytes.length + 4);
    finalBytes.set(bytes);
    finalBytes.set(checksum, bytes.length);
    return bs58.encode(finalBytes);
  },

  addressFromPrivateKey: (privateKey: string): string => {
    const w = new ethers.Wallet(privateKey);
    const hexAddr = "0x41" + w.address.slice(2);
    return TronService.fromHexAddress(hexAddr);
  },

  // API Calls
  rpcCall: async (host: string, path: string, payload: any) => {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  getBalance: async (host: string, addressBase58: string): Promise<string> => {
    const hex = TronService.toHexAddress(addressBase58);
    const res = await TronService.rpcCall(host, '/wallet/getaccount', { address: hex });
    return (res.balance || 0).toString(); 
  },

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
    
    if (res.result && res.result.result && res.constant_result && res.constant_result[0]) {
       return BigInt("0x" + res.constant_result[0]).toString();
    }
    return "0";
  },

  getTransactionInfo: async (host: string, txId: string) => {
    return TronService.rpcCall(host, '/wallet/gettransactioninfobyid', { value: txId });
  },

  // Transactions
  sendTrx: async (host: string, privateKey: string, toBase58: string, amountSun: number) => {
    const fromBase58 = TronService.addressFromPrivateKey(privateKey);
    const fromHex = TronService.toHexAddress(fromBase58);
    const toHex = TronService.toHexAddress(toBase58);

    const tx = await TronService.rpcCall(host, '/wallet/createtransaction', {
      to_address: toHex,
      owner_address: fromHex,
      amount: amountSun
    });

    if (tx.Error) throw new Error(tx.Error);

    const signedTx = await TronService.signTransaction(privateKey, tx);

    const broadcast = await TronService.rpcCall(host, '/wallet/broadcasttransaction', signedTx);
    
    if (broadcast.result) return broadcast.txid || tx.txID;
    throw new Error(JSON.stringify(broadcast));
  },

  sendTrc20: async (host: string, privateKey: string, toBase58: string, amountRaw: string, contractBase58: string) => {
    const fromBase58 = TronService.addressFromPrivateKey(privateKey);
    const fromHex = TronService.toHexAddress(fromBase58);
    const contractHex = TronService.toHexAddress(contractBase58);
    const toHex = TronService.toHexAddress(toBase58);

    const addrParam = "0".repeat(24) + toHex.slice(4); 
    const amountHex = BigInt(amountRaw).toString(16);
    const amountParam = "0".repeat(64 - amountHex.length) + amountHex;
    const parameter = addrParam + amountParam;

    const tx = await TronService.rpcCall(host, '/wallet/triggersmartcontract', {
      owner_address: fromHex,
      contract_address: contractHex,
      function_selector: 'transfer(address,uint256)',
      parameter: parameter,
      fee_limit: 100000000 
    });

    if (!tx.result || !tx.result.result) throw new Error("Smart contract trigger failed");

    const signedTx = await TronService.signTransaction(privateKey, tx.transaction);
    const broadcast = await TronService.rpcCall(host, '/wallet/broadcasttransaction', signedTx);

    if (broadcast.result) return broadcast.txid || tx.transaction.txID;
    throw new Error(JSON.stringify(broadcast));
  },

  signTransaction: async (privateKey: string, transaction: any) => {
    const wallet = new ethers.Wallet(privateKey);
    const txID = transaction.txID;
    const signatureObj = wallet.signingKey.sign("0x" + txID);
    const signature = signatureObj.serialized; 
    
    return {
      ...transaction,
      signature: [signature]
    };
  }
};
