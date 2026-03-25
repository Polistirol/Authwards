import type { DbAgent, PermissionProfile } from "../types/db.js";

const NANOS_PER_IOTA = 1_000_000_000n;

type LimitFields = Pick<DbAgent, "permissionProfile" | "permitMaxPerTxIota" | "permitMaxPerDayIota">;

function getPermissionLimitsLegacy(profile: PermissionProfile): {
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
      const maxPerTx = BigInt(tx) * NANOS_PER_IOTA;
      const maxPerDay = BigInt(day) * NANOS_PER_IOTA;
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
