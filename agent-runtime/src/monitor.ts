import type { IotaClient } from "@iota/iota-sdk/client";

import type { DbAgent } from "./types/db.js";

/** Threshold: > 1 IOTA in nano (testnet-style). */
const THRESHOLD_NANO = BigInt(1_000_000_000);

export type MonitorResult = {
  conditionMet: boolean;
  currentValue: unknown;
  threshold: unknown;
  monitorKind: "balance";
};

/**
 * `balance_monitor`: on-chain balance of the agent address.
 */
export async function checkCondition(
  agentDid: string,
  iotaClient: IotaClient,
  agentIotaAddress: string,
  _agentConfig: DbAgent,
): Promise<MonitorResult> {
  void agentDid;
  void _agentConfig;
  const { totalBalance } = await iotaClient.getBalance({ owner: agentIotaAddress });
  const bal = BigInt(totalBalance);
  return {
    conditionMet: bal > THRESHOLD_NANO,
    currentValue: totalBalance,
    threshold: THRESHOLD_NANO.toString(),
    monitorKind: "balance",
  };
}
