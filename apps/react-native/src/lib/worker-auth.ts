interface CachedToken {
  token: string;
  wallet: string;
  workerUrl: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

interface WorkerAuthOptions {
  workerUrl: string;
  wallet: string;
  signMessage: (message: string) => Promise<string>;
}

const cacheKey = (workerUrl: string, wallet: string) => `${workerUrl}|${wallet.toLowerCase()}`;

export async function getWorkerToken(options: WorkerAuthOptions): Promise<string> {
  const wallet = options.wallet.toLowerCase();
  const key = cacheKey(options.workerUrl, wallet);
  const now = Date.now();
  const cached = tokenCache.get(key);

  if (cached && cached.expiresAt > now + 60000) {
    return cached.token;
  }

  const nonceRes = await fetch(`${options.workerUrl}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });

  if (!nonceRes.ok) {
    const err = (await nonceRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Failed to get nonce: ${err.error || nonceRes.statusText}`);
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const signature = await options.signMessage(nonce);

  const verifyRes = await fetch(`${options.workerUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, nonce }),
  });

  if (!verifyRes.ok) {
    const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Auth verification failed: ${err.error || verifyRes.statusText}`);
  }

  const { token } = (await verifyRes.json()) as { token: string };

  tokenCache.set(key, {
    token,
    wallet,
    workerUrl: options.workerUrl,
    expiresAt: now + 55 * 60 * 1000,
  });

  return token;
}
