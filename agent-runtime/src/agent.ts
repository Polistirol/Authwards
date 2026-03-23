import type { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";

import * as db from "./services/db.js";
import { execute, executeShipmentRelease } from "./executor.js";
import * as monitor from "./monitor.js";
import * as permissions from "./permissions.js";
import type { DbAgent } from "./types/db.js";
import type { AgentLogMessage, AgentLogType } from "./ws-logger.js";

const TX_AMOUNT_NANO = 1n;

export type AgentLogger = {
  log: (type: AgentLogType, data: unknown) => Promise<void>;
  iotaClient: IotaClient;
  payoutAddress: string;
};

function resolveTaskType(agent: DbAgent): "balance_monitor" | "shipment_monitor" {
  const t = agent.taskType;
  if (t === "shipment_monitor") return "shipment_monitor";
  return "balance_monitor";
}

export class Agent {
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly agentIotaAddress: string;

  constructor(
    readonly agentConfig: DbAgent,
    private readonly privateKeySeed: Uint8Array,
    private readonly logger: AgentLogger,
  ) {
    const kp = Ed25519Keypair.fromSecretKey(privateKeySeed);
    this.agentIotaAddress = kp.getPublicKey().toIotaAddress();
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    void this.logger.log("start", { agentDid: this.agentConfig.agentDid });
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const { agentConfig, logger, privateKeySeed, agentIotaAddress } = this;
    const { iotaClient, payoutAddress } = logger;
    const taskType = resolveTaskType(agentConfig);

    try {
      let r: monitor.MonitorResult;
      try {
        r = await monitor.checkCondition(agentConfig.agentDid, iotaClient, agentIotaAddress, agentConfig);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error(`[agent ${agentConfig.agentDid}] monitor error:`, err);
        await logger.log("error", { phase: "monitor", error: err });
        return;
      }

      if (r.monitorKind === "shipment_status") {
        if (r.shipmentCheckLog) {
          await logger.log("check", r.shipmentCheckLog);
        }
        if (!r.conditionMet) return;
      } else {
        await logger.log("check", { checking: "balance condition" });
        if (!r.conditionMet) {
          await logger.log("check", { conditionMet: false, currentValue: r.currentValue, threshold: r.threshold });
          return;
        }
      }

      await logger.log("trigger", { conditionMet: true, currentValue: r.currentValue, threshold: r.threshold });

      if (taskType === "shipment_monitor") {
        const shipmentId = agentConfig.taskConfig?.shipmentId;
        const action = agentConfig.taskConfig?.action;
        if (!shipmentId || action !== "release_payment") {
          await logger.log("error", { phase: "task", error: "taskConfig richiede shipmentId e action release_payment" });
          return;
        }

        const shipment = await db.getShipment(shipmentId);
        if (!shipment) {
          await logger.log("error", { phase: "shipment", error: `Spedizione non trovata: ${shipmentId}` });
          return;
        }

        const amountUnits = Math.max(1, Math.round(shipment.paymentAmount));
        const daily = permissions.getDailySpent(agentConfig.agentDid);
        const perm = permissions.checkPermission(agentConfig.permissionProfile, amountUnits, daily);
        if (!perm.allowed) {
          await logger.log("permission_denied", { reason: perm.reason });
          return;
        }

        if (!payoutAddress) {
          await logger.log("error", { phase: "payout", error: "Destinatario non configurato (AGENT_PAYOUT_ADDRESS)" });
          return;
        }

        try {
          const result = await executeShipmentRelease(agentConfig, privateKeySeed, iotaClient, payoutAddress);
          permissions.recordSpend(agentConfig.agentDid, amountUnits);
          await logger.log("tx_success", {
            txHash: result.txHash,
            shipmentId: result.shipmentId,
            amount: result.amount,
            action: "payment_released",
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          console.error(`[agent ${agentConfig.agentDid}] execute error:`, err);
          await logger.log("tx_fail", { error: err });
        }
        return;
      }

      const daily = permissions.getDailySpent(agentConfig.agentDid);
      const amountUnits = Number(TX_AMOUNT_NANO);
      const perm = permissions.checkPermission(agentConfig.permissionProfile, amountUnits, daily);
      if (!perm.allowed) {
        await logger.log("permission_denied", { reason: perm.reason });
        return;
      }

      if (!payoutAddress) {
        await logger.log("error", { phase: "payout", error: "Destinatario non configurato (AGENT_PAYOUT_ADDRESS)" });
        return;
      }

      try {
        const result = await execute(agentConfig, privateKeySeed, iotaClient, payoutAddress, TX_AMOUNT_NANO);
        permissions.recordSpend(agentConfig.agentDid, amountUnits);
        await logger.log("tx_success", { txHash: result.txHash });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error(`[agent ${agentConfig.agentDid}] execute error:`, err);
        await logger.log("tx_fail", { error: err });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[agent ${this.agentConfig.agentDid}] tick error:`, err);
      try {
        await this.logger.log("error", { phase: "tick", error: err });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function persistAndBroadcastLog(
  broadcast: (m: AgentLogMessage) => void,
  agentDid: string,
  type: AgentLogType,
  data: unknown,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const msg: AgentLogMessage = { agentDid, timestamp, type, data };
  broadcast(msg);
  await db.addAgentLog({
    agentDid,
    createdAt: timestamp,
    type,
    data,
  });
}
