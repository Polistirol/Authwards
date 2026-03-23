import type { IotaClient } from "@iota/iota-sdk/client";

import * as db from "./services/db.js";
import type { DbAgent } from "./types/db.js";

/** Soglia: > 1 IOTA in nano (stile testnet). */
const THRESHOLD_NANO = BigInt(1_000_000_000);

export type MonitorResult = {
  conditionMet: boolean;
  currentValue: unknown;
  threshold: unknown;
  monitorKind: "balance" | "shipment_status";
  /** Per log `check` supply chain: `{ shipmentId, currentStatus, waitingFor }` */
  shipmentCheckLog?: {
    shipmentId: string;
    currentStatus: string;
    waitingFor: "delivered";
  };
};

function resolveTaskType(agent: DbAgent): "balance_monitor" | "shipment_monitor" {
  const t = agent.taskType;
  if (t === "shipment_monitor") return "shipment_monitor";
  return "balance_monitor";
}

/**
 * `balance_monitor` (default): saldo on-chain dell'agente.
 * `shipment_monitor`: legge `db.json` e verifica `shipment.status === "delivered"`.
 */
export async function checkCondition(
  agentDid: string,
  iotaClient: IotaClient,
  agentIotaAddress: string,
  agentConfig: DbAgent,
): Promise<MonitorResult> {
  void agentDid;
  if (resolveTaskType(agentConfig) === "shipment_monitor") {
    const shipmentId = agentConfig.taskConfig?.shipmentId;
    if (!shipmentId) {
      return {
        conditionMet: false,
        currentValue: null,
        threshold: "delivered",
        monitorKind: "shipment_status",
      };
    }
    const shipment = await db.getShipment(shipmentId);
    if (!shipment) {
      return {
        conditionMet: false,
        currentValue: null,
        threshold: "delivered",
        monitorKind: "shipment_status",
        shipmentCheckLog: { shipmentId, currentStatus: "not_found", waitingFor: "delivered" },
      };
    }
    const conditionMet = shipment.status === "delivered";
    return {
      conditionMet,
      currentValue: shipment.status,
      threshold: "delivered",
      monitorKind: "shipment_status",
      shipmentCheckLog: {
        shipmentId,
        currentStatus: shipment.status,
        waitingFor: "delivered",
      },
    };
  }

  const { totalBalance } = await iotaClient.getBalance({ owner: agentIotaAddress });
  const bal = BigInt(totalBalance);
  return {
    conditionMet: bal > THRESHOLD_NANO,
    currentValue: totalBalance,
    threshold: THRESHOLD_NANO.toString(),
    monitorKind: "balance",
  };
}
