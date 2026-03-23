import { Router } from "express";
import { IotaClient } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";

import { requireAgentToken } from "../middleware/agentAuth.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { getPermissionLimits, utcDateString } from "../services/agentPermissions.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import type { AgentStatus, DbAgent } from "../types/db.js";

const router = Router();

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL non impostata");
  return url;
}

function effectiveStatus(a: DbAgent): AgentStatus {
  if (a.status) return a.status;
  if (a.active === false) return "revoked";
  if (a.active === true) return "active";
  return "pending_activation";
}

function requireBridgeAgent(a: DbAgent | undefined): a is DbAgent & {
  agentToken: string;
  agentIndex: number;
} {
  return Boolean(
    a?.agentToken && typeof a.agentToken === "string" && typeof a.agentIndex === "number",
  );
}

router.post("/activate", requireAgentToken, async (req, res) => {
  try {
    const a = req.agent!;
    const st = effectiveStatus(a);
    if (st === "revoked") {
      res.status(403).json({ error: "agent_revoked" });
      return;
    }
    if (st === "active") {
      res.json({ status: "already_active", agentDid: a.agentDid });
      return;
    }
    if (a.permitObjectId) {
      console.log("[bridge] Agent activated with on-chain permit:", a.permitObjectId);
    }
    await db.updateAgentByDid(a.agentDid, {
      status: "active",
      activatedAt: new Date().toISOString(),
    });
    res.json({
      status: "active",
      agentDid: a.agentDid,
      permissions: {
        permissionProfile: a.permissionProfile,
        taskType: a.taskType,
      },
      message: "Agent successfully activated",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore activate";
    res.status(500).json({ error: msg });
  }
});

router.post("/check", requireAgentToken, async (req, res) => {
  try {
    const a = req.agent!;
    const st = effectiveStatus(a);
    if (st !== "active") {
      res.status(403).json({
        error: "agent_not_activated",
        message: st === "revoked" ? "Agent revoked" : "Complete onboarding first",
      });
      return;
    }
    if (a.taskType === "shipment_monitor" && a.taskConfig?.shipmentId) {
      const ship = await db.findShipmentById(a.taskConfig.shipmentId);
      if (!ship) {
        res.json({
          conditionMet: false,
          data: { shipmentId: a.taskConfig.shipmentId, error: "shipment_not_found" },
        });
        return;
      }
      const conditionMet = ship.status === "delivered";
      res.json({
        conditionMet,
        data: {
          shipmentId: ship.id,
          currentStatus: ship.status,
          product: ship.product,
          destination: ship.destination,
        },
      });
      return;
    }
    res.json({ conditionMet: false, data: { reason: "no_monitor_config" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore check";
    res.status(500).json({ error: msg });
  }
});

router.post("/execute", requireAgentToken, async (req, res) => {
  try {
    const a = req.agent!;
    const st = effectiveStatus(a);
    if (st !== "active") {
      res.status(403).json({
        error: "agent_not_activated",
        message: "Agent must be active",
      });
      return;
    }
    if (!requireBridgeAgent(a)) {
      res.status(400).json({ error: "legacy_agent", message: "Agent must use Agent Bridge (re-create agent)" });
      return;
    }

    const action = (req.body?.action as string) ?? "release_payment";
    if (a.permissionProfile === "readonly") {
      res.status(403).json({ error: "permission_denied", message: "readonly profile cannot execute" });
      return;
    }

    const owner = await db.findUserByGoogleId(a.ownerGoogleId);
    if (!owner?.walletAddress) {
      res.status(400).json({ error: "owner_wallet_missing" });
      return;
    }

    const limits = getPermissionLimits(a.permissionProfile);
    const today = utcDateString();
    let spentToday = BigInt(a.spentTodayNanos ?? "0");
    if (a.spentTodayDate !== today) {
      spentToday = 0n;
    }

    const taskAmount =
      typeof a.taskConfig?.amountNanos === "number"
        ? BigInt(Math.floor(a.taskConfig.amountNanos))
        : 50_000_000n;
    const amountNanos = taskAmount;

    if (amountNanos > limits.maxPerTx) {
      res.status(403).json({ error: "tx_limit", maxPerTx: limits.maxPerTx.toString() });
      return;
    }
    if (spentToday + amountNanos > limits.maxPerDay) {
      res.status(403).json({
        error: "daily_limit",
        remainingDailyBudget: (limits.maxPerDay - spentToday).toString(),
      });
      return;
    }

    const recipient =
      typeof a.taskConfig?.recipientAddress === "string" && a.taskConfig.recipientAddress.trim()
        ? a.taskConfig.recipientAddress.trim()
        : owner.walletAddress;

    const { keypair } = deriveAgentKeypair(a.ownerGoogleId, owner.walletAddress, a.agentIndex);

    const client = new IotaClient({ url: getNodeUrl() });
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [amountNanos]);
    tx.transferObjects([coin], recipient);

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: TX_OPTS,
    });

    const newSpent = spentToday + amountNanos;
    await db.updateAgentByDid(a.agentDid, {
      spentTodayNanos: newSpent.toString(),
      spentTodayDate: today,
    });

    if (a.taskType === "shipment_monitor" && a.taskConfig?.shipmentId && action === "release_payment") {
      await db.updateShipmentById(a.taskConfig.shipmentId, { status: "payment_released" });
    }

    await db.addAgentLog({
      agentDid: a.agentDid,
      createdAt: new Date().toISOString(),
      message: `bridge_execute ${action}`,
      meta: {
        txHash: result.digest,
        amountNanos: amountNanos.toString(),
        recipient,
        action,
      },
    });

    res.json({
      success: true,
      txHash: result.digest,
      amount: Number(amountNanos),
      remainingDailyBudget: Number(limits.maxPerDay - newSpent),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore execute";
    res.status(500).json({ error: msg });
  }
});

router.get("/status", requireAgentToken, async (req, res) => {
  try {
    const a = req.agent!;
    const st = effectiveStatus(a);
    const limits = getPermissionLimits(a.permissionProfile);
    const today = utcDateString();
    let spentToday = BigInt(a.spentTodayNanos ?? "0");
    if (a.spentTodayDate !== today) {
      spentToday = 0n;
    }

    let balance = "0";
    if (a.walletAddress) {
      const client = new IotaClient({ url: getNodeUrl() });
      const { totalBalance } = await client.getBalance({ owner: a.walletAddress });
      balance = totalBalance;
    }

    res.json({
      agentDid: a.agentDid,
      status: st,
      permissionProfile: a.permissionProfile,
      walletAddress: a.walletAddress,
      balance,
      permitObjectId: a.permitObjectId ?? null,
      activatedAt: a.activatedAt ?? null,
      createdAt: a.createdAt,
      taskType: a.taskType,
      taskConfig: a.taskConfig,
      permissions: {
        maxPerTx: limits.maxPerTx.toString(),
        maxPerDay: limits.maxPerDay.toString(),
        spentToday: spentToday.toString(),
        expiresAt: null as string | null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore status";
    res.status(500).json({ error: msg });
  }
});

router.post("/revoke", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDid = req.body?.agentDid;
    if (typeof agentDid !== "string" || !agentDid.trim()) {
      res.status(400).json({ error: "Body richiede { agentDid: string }" });
      return;
    }
    const a = await db.findAgentByDid(agentDid.trim());
    if (!a || a.ownerGoogleId !== jwtUser.googleId) {
      res.status(403).json({ error: "Agente non trovato o non autorizzato" });
      return;
    }
    if (a.permitObjectId) {
      console.log("[bridge] revoke: AgentPermit on-chain non revocato (contratto non deployato):", a.permitObjectId);
    }
    await db.updateAgentByDid(a.agentDid, { status: "revoked", active: false });
    res.json({ status: "revoked" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore revoke";
    res.status(500).json({ error: msg });
  }
});

export default router;
