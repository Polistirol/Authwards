import { NANOS_PER_IOTA_BI } from "../constants.js";
import type { DbAgent, PermissionProfile } from "../types/db.js";

type LimitFields = Pick<DbAgent, "permissionProfile" | "permitMaxPerTxIota" | "permitMaxPerDayIota">;

function getPermissionLimitsLegacy(profile: PermissionProfile): {
  maxPerTx: bigint;
  maxPerDay: bigint;
} {
  switch (profile) {
    case "readonly":
      return { maxPerTx: 0n, maxPerDay: 0n };
    case "low_value":
      // 5 / 20 whole IOTA (nanos)
      return { maxPerTx: 5n * NANOS_PER_IOTA_BI, maxPerDay: 20n * NANOS_PER_IOTA_BI };
    case "full_access":
      return { maxPerTx: 1000n * NANOS_PER_IOTA_BI, maxPerDay: 10000n * NANOS_PER_IOTA_BI };
    case "custom":
      return { maxPerTx: 0n, maxPerDay: 0n };
    default:
      return { maxPerTx: 0n, maxPerDay: 0n };
  }
}

/** Limits in nanos (fallback; on-chain AgentPermit when available). */
export function getPermissionLimits(
  agentOrProfile: LimitFields | PermissionProfile,
): {
  maxPerTx: bigint;
  maxPerDay: bigint;
} {
  if (typeof agentOrProfile === "string") {
    return getPermissionLimitsLegacy(agentOrProfile);
  }
  const agent = agentOrProfile;
  const tx = agent.permitMaxPerTxIota?.trim();
  const day = agent.permitMaxPerDayIota?.trim();
  if (tx && day) {
    try {
      const maxPerTx = BigInt(tx) * NANOS_PER_IOTA_BI;
      const maxPerDay = BigInt(day) * NANOS_PER_IOTA_BI;
      return { maxPerTx, maxPerDay };
    } catch {
      /* fall through */
    }
  }
  return getPermissionLimitsLegacy(agent.permissionProfile);
}

export function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
