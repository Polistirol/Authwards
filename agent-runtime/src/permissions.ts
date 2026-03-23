import type { PermissionProfile } from "./types/db.js";

export const PROFILES = {
  readonly: { canTransact: false, maxPerTx: 0, maxPerDay: 0 },
  low_value: { canTransact: true, maxPerTx: 5, maxPerDay: 20 },
  full_access: { canTransact: true, maxPerTx: Number.POSITIVE_INFINITY, maxPerDay: Number.POSITIVE_INFINITY },
} as const;

/** Totale speso "oggi" in unità arbitrarie (MVP: reset solo al riavvio). */
const dailySpentByAgent = new Map<string, number>();

export function recordSpend(agentDid: string, amount: number): void {
  dailySpentByAgent.set(agentDid, (dailySpentByAgent.get(agentDid) ?? 0) + amount);
}

export function getDailySpent(agentDid: string): number {
  return dailySpentByAgent.get(agentDid) ?? 0;
}

export function checkPermission(
  profile: PermissionProfile,
  amount: number,
  dailySpent: number,
): { allowed: boolean; reason?: string } {
  const p = PROFILES[profile];
  if (!p) return { allowed: false, reason: `Profilo sconosciuto: ${profile}` };
  if (!p.canTransact) {
    return { allowed: false, reason: "Profilo readonly: transazioni non consentite" };
  }
  if (amount > p.maxPerTx) {
    return { allowed: false, reason: `Importo ${amount} supera maxPerTx (${p.maxPerTx})` };
  }
  if (dailySpent + amount > p.maxPerDay) {
    return { allowed: false, reason: `Limite giornaliero: ${dailySpent + amount} > ${p.maxPerDay}` };
  }
  return { allowed: true };
}
