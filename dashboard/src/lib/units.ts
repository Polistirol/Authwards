/** Keep in sync with `backend/src/constants.ts` (NANOS_PER_IOTA). */
export const NANOS_PER_IOTA = 1_000_000_000;

export function iotaToNanos(iota: number): bigint {
  return BigInt(Math.round(iota * NANOS_PER_IOTA));
}
