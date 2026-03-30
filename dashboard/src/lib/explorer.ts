/** IOTA Explorer URLs (paths `/address/`, `/object/`, `/txblock/`). */

export function explorerAddressUrl(address: string, userDid: string): string {
  const base = `https://explorer.iota.org/address/${encodeURIComponent(address)}`;
  const m = userDid.match(/did:iota:([^:]+):/);
  const net = m?.[1];
  if (net && net !== "mainnet") {
    return `${base}?network=${encodeURIComponent(net)}`;
  }
  return base;
}

/** DID document on-chain: last segment `0x…` → `/object/0x...` (+ network from DID). */
export function explorerDidObjectUrl(did: string): string | null {
  const trimmed = did.trim();
  const parts = trimmed.split(":");
  const last = parts[parts.length - 1] ?? "";
  if (!last.startsWith("0x") || last.length < 3) return null;
  const base = `https://explorer.iota.org/object/${encodeURIComponent(last)}`;
  const m = trimmed.match(/did:iota:([^:]+):/);
  const net = m?.[1];
  if (net && net !== "mainnet") {
    return `${base}?network=${encodeURIComponent(net)}`;
  }
  return base;
}

export function explorerTxUrl(txHash: string, userDid: string): string {
  const base = `https://explorer.iota.org/txblock/${encodeURIComponent(txHash)}`;
  const m = userDid.match(/did:iota:([^:]+):/);
  const net = m?.[1];
  if (net && net !== "mainnet") {
    return `${base}?network=${encodeURIComponent(net)}`;
  }
  return base;
}
