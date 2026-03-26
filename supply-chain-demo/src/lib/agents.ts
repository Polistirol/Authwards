import type { Agent } from "../../../sdk";

export function findAgentForShipment(
  agents: Agent[],
  shipmentId: string,
): Agent | undefined {
  return agents.find((a) => {
    const cfg = a.taskConfig as { shipmentId?: string } | undefined;
    return a.taskType === "shipment_monitor" && cfg?.shipmentId === shipmentId;
  });
}
