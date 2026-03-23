import type { PermissionProfile } from "../types/db.js";

/** Limiti in nanos (fallback; AgentPermit on-chain quando disponibile). */
export function getPermissionLimits(profile: PermissionProfile): {
  maxPerTx: bigint;
  maxPerDay: bigint;
} {
  switch (profile) {
    case "readonly":
      return { maxPerTx: 0n, maxPerDay: 0n };
    case "low_value":
      return { maxPerTx: 50_000_000n, maxPerDay: 500_000_000n };
    case "full_access":
      return { maxPerTx: 1_000_000_000n, maxPerDay: 5_000_000_000n };
    default:
      return { maxPerTx: 0n, maxPerDay: 0n };
  }
}

export function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
