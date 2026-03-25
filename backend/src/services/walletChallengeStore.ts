const TTL_MS = 5 * 60 * 1000;

type Entry = { nonce: string; expiresAt: number };

const store = new Map<string, Entry>();

function addrKey(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

export function setWalletChallenge(walletAddress: string, nonce: string): void {
  prune();
  store.set(addrKey(walletAddress), { nonce, expiresAt: Date.now() + TTL_MS });
}

/** Removes and returns true if the nonce is valid and matches. */
export function consumeWalletChallenge(walletAddress: string, nonce: string): boolean {
  prune();
  const k = addrKey(walletAddress);
  const e = store.get(k);
  if (!e || e.nonce !== nonce) return false;
  if (Date.now() > e.expiresAt) {
    store.delete(k);
    return false;
  }
  store.delete(k);
  return true;
}
