
import { ethers } from 'ethers';
import bs58 from 'bs58';

export const TronService = {
  // Address Utilities
  toHexAddress: (base58Addr: string): string => {
    if (!base58Addr) return "";
    if (base58Addr.startsWith("0x")) {
        // If it's a 20-byte ETH address (42 chars), convert to 21-byte Tron Hex (44 chars)
        if (base58Addr.length === 42) {
            return "0x41" + base58Addr.slice(2);
        }
        return base58Addr;
    }
    try {
      const bytes = bs58.decode(base58Addr);
      const hex = ethers.hexlify(bytes.slice(0, -4)); // Remove 4-byte checksum
      return hex; // Returns 0x41...
    } catch (e) { return ""; }
  },

  fromHexAddress: (hexAddr: string): string => {
    if (!hexAddr.startsWith("0x")) hexAddr = "0x" + hexAddr;
    if (hexAddr.length < 42) return ""; // Invalid length
    // Ensure prefix is 41
    if (hexAddr.substring(0, 4) !== "0x41") {
       // Convert Eth address to Tron
       hexAddr = "0x41" + hexAddr.substring(2);
    }
    const bytes = ethers.getBytes(hexAddr);
    // Use ethers for SHA256 (returns hex, convert to bytes)
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
    // w.address is 0x... (20 bytes)
    // Tron address is 41 + address (20 bytes)
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
    return (res.balance || 0).toString(); // in SUN
  },

  getTrc20Balance: async (host: string, addressBase58: string, contractBase58: string): Promise<string> => {
    const ownerHex = TronService.toHexAddress(addressBase58);
    const contractHex = TronService.toHexAddress(contractBase58);
    // ABI Encode balanceOf(address): 70a08231 + 32-byte padded address
    // Address in ABI is 20 bytes (without 41 prefix) padded to 32 bytes
    const addrParam = "0".repeat(24) + ownerHex.slice(4); // Remove 0x41 -> get 20 bytes -> pad
    
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

    // 1. Create Transaction
    const tx = await TronService.rpcCall(host, '/wallet/createtransaction', {
      to_address: toHex,
      owner_address: fromHex,
      amount: amountSun
    });

    if (tx.Error) throw new Error(tx.Error);

    // 2. Sign
    const signedTx = await TronService.signTransaction(privateKey, tx);

    // 3. Broadcast
    const broadcast = await TronService.rpcCall(host, '/wallet/broadcasttransaction', signedTx);
    
    if (broadcast.result) return broadcast.txid || tx.txID;
    throw new Error(JSON.stringify(broadcast));
  },

  sendTrc20: async (host: string, privateKey: string, toBase58: string, amountRaw: string, contractBase58: string) => {
    const fromBase58 = TronService.addressFromPrivateKey(privateKey);
    const fromHex = TronService.toHexAddress(fromBase58);
    const contractHex = TronService.toHexAddress(contractBase58);
    const toHex = TronService.toHexAddress(toBase58);

    // ABI Encode transfer(address,uint256)
    // address: 20 bytes (eth style) padded
    const addrParam = "0".repeat(24) + toHex.slice(4); 
    // amount: uint256 padded
    const amountHex = BigInt(amountRaw).toString(16);
    const amountParam = "0".repeat(64 - amountHex.length) + amountHex;
    const parameter = addrParam + amountParam;

    const tx = await TronService.rpcCall(host, '/wallet/triggersmartcontract', {
      owner_address: fromHex,
      contract_address: contractHex,
      function_selector: 'transfer(address,uint256)',
      parameter: parameter,
      fee_limit: 100000000 // 100 TRX limit default
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
    // Sign the hash (txID) directly
    // Ethers signingKey.sign returns {r, s, v}
    const signatureObj = wallet.signingKey.sign("0x" + txID);
    
    // Tron expects signature as hex string of r + s + v
    const signature = signatureObj.serialized; // This is a hex string
    
    // Append to transaction
    return {
      ...transaction,
      signature: [signature]
    };
  }
};
