import type { Agent } from "../../../sdk";

export function findAgentForShipment(
  agents: Agent[],
  shipmentId: string,
): Agent | undefined {
  return agents.find(
    (a) =>
      a.taskType === "shipment_monitor" && a.taskConfig?.shipmentId === shipmentId,
  );
}
