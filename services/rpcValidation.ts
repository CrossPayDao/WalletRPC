export const isHttpUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (input: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const probeEvmChainId = async (rpcUrl: string, timeoutMs: number = 5000): Promise<number> => {
  const response = await fetchWithTimeout(
    rpcUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: []
      })
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`RPC responded with HTTP ${response.status}`);
  }

  const data = await response.json();
  const hex = data?.result;
  if (typeof hex !== 'string' || !hex.startsWith('0x')) {
    throw new Error('Invalid RPC response for eth_chainId');
  }

  return Number(BigInt(hex));
};

export const validateEvmRpcEndpoint = async (
  rpcUrl: string,
  expectedChainId: number,
  timeoutMs: number = 5000
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!isHttpUrl(rpcUrl)) {
    return { ok: false, error: 'RPC URL must start with http(s)://' };
  }

  try {
    const chainId = await probeEvmChainId(rpcUrl, timeoutMs);
    if (chainId !== expectedChainId) {
      return { ok: false, error: `RPC chainId mismatch: expected ${expectedChainId}, got ${chainId}` };
    }
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `RPC validation failed: ${msg}` };
  }
};
