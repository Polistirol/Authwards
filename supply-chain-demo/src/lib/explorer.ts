/** Explorer base (testnet). Adjust if your deployment uses another network. */
const EXPLORER = "https://explorer.iota.org/testnet";

export function explorerDidUrl(did: string): string {
  return `${EXPLORER}/did/${encodeURIComponent(did)}`;
}

export function explorerTxUrl(txDigest: string): string {
  return `${EXPLORER}/txblock/${encodeURIComponent(txDigest)}`;
}

/** Object / package explorer path varies; this follows common IOTA explorer patterns. */
export function explorerObjectUrl(objectId: string): string {
  return `${EXPLORER}/object/${encodeURIComponent(objectId)}`;
}
