/** Keep in sync with `backend/src/constants.ts` (NANOS_PER_IOTA). */
export const NANOS_PER_IOTA = 1_000_000_000;

export function iotaToNanos(iota: number): bigint {
  return BigInt(Math.round(iota * NANOS_PER_IOTA));
}

/** Exact decimal string for IOTA amounts from chain nanos (no float drift). */
export function nanosToIotaString(nanos: bigint): string {
  const neg = nanos < 0n;
  const n = neg ? -nanos : nanos;
  const whole = n / BigInt(NANOS_PER_IOTA);
  const frac = n % BigInt(NANOS_PER_IOTA);
  if (frac === 0n) return (neg ? "-" : "") + whole.toString();
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + `${whole}.${fracStr}`;
}
