// UNITÀ DI MISURA — CONVENZIONI
//
// | Dove                        | Unità   | Note                              |
// |-----------------------------|---------|-----------------------------------|
// | Contratto Move              | nanos   | Tutti i campi amount            |
// | SDK IOTA (splitCoins, etc.) | nanos   | Standard del protocollo         |
// | Backend internamente        | nanos   | Conversione all'ingresso        |
// | API request body (amount)   | nanos   | Default; opzionale `unit`       |
// | API response (balance)      | entrambi| balanceNanos + balanceIota      |
// | db.json agentLogs meta      | nanos   | Coerenza con on-chain           |
// | .env WELCOME_AIRDROP_AMOUNT | IOTA    | Leggibilità, converti al boot   |
// | .env permit profiles        | IOTA    | Converti in permitContract.ts   |
// | Dashboard / demo UIs        | IOTA    | Conversione nel frontend      |

/** Number of nanos in one whole IOTA (10^9). */
export const NANOS_PER_IOTA = 1_000_000_000;

/** BigInt nanos per whole IOTA (for bigint-safe scaling). */
export const NANOS_PER_IOTA_BI = 1_000_000_000n;

/** Convert fractional IOTA (e.g. from env or UI) to nanos. Prefer over float math at call sites. */
export function iotaToNanos(iota: number): bigint {
  return BigInt(Math.round(iota * NANOS_PER_IOTA));
}

/** Convert whole IOTA counts (integer semantics) to nanos without floating point. */
export function wholeIotaToNanos(wholeIota: bigint): bigint {
  return wholeIota * NANOS_PER_IOTA_BI;
}

/** Convert nanos to IOTA as a JS number (OK for display/API; not for chain-critical bigint math). */
export function nanosToIota(nanos: bigint | number): number {
  return Number(BigInt(nanos)) / NANOS_PER_IOTA;
}
