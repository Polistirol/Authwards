import type { Agent } from "../../../sdk";

export function permissionCaps(agent: Agent): { maxPerTx: string; maxPerDay: string } {
  switch (agent.permissionProfile) {
    case "readonly":
      return { maxPerTx: "0 IOTA", maxPerDay: "0 IOTA" };
    case "low_value":
      return { maxPerTx: "50 IOTA", maxPerDay: "500 IOTA" };
    case "full_access":
      return { maxPerTx: "1000 IOTA", maxPerDay: "5000 IOTA" };
    default:
      return { maxPerTx: "—", maxPerDay: "—" };
  }
}
