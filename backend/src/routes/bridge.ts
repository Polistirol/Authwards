import { Router } from "express";
import { IotaClient } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";

import { requireAgentToken } from "../middleware/agentAuth.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { getPermissionLimits, utcDateString } from "../services/agentPermissions.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import {
  authorizeSpendOnChain,
  getPermitInfo,
  revokePermitOnChain,
} from "../services/permitContract.js";
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
  if (a.status === "pending_activation") return "created";
  if (a.status === "created" || a.status === "active" || a.status === "revoked") {
    return a.status;
  }
  if (a.status) return a.status;
  if (a.active === false) return "revoked";
  if (a.active === true) return "active";
  return "created";
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
    res.status(403).json({
      error: "activate_from_dashboard",
      message: "Please activate this agent from the dashboard first",
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
        message:
          st === "revoked"
            ? "Agent revoked"
            : "Agent must be activated from the dashboard",
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
        message:
          st === "revoked"
            ? "Agent must be active"
            : "Agent must be activated from the dashboard",
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

    const owner = await db.findUserByProvider(a.ownerProviderId, a.ownerProviderType);
    if (!owner?.walletAddress) {
      res.status(400).json({ error: "owner_wallet_missing" });
      return;
    }

    const taskAmount =
      typeof a.taskConfig?.amountNanos === "number"
        ? BigInt(Math.floor(a.taskConfig.amountNanos))
        : 50_000_000n;
    const amountNanos = taskAmount;

    const limits = getPermissionLimits(a);
    const today = utcDateString();
    let spentToday = BigInt(a.spentTodayNanos ?? "0");
    if (a.spentTodayDate !== today) {
      spentToday = 0n;
    }

    let usedOnChainPermit = false;
    if (a.permitObjectId) {
      const auth = await authorizeSpendOnChain(a.permitObjectId, amountNanos);
      if (auth.success) {
        usedOnChainPermit = true;
      } else if (auth.networkError || auth.error === "permit_package_missing") {
        console.warn(
          "[bridge/execute] On-chain permit non verificabile (rete o package non configurato), uso fallback db.json",
        );
      } else {
        const err = auth.error;
        const msg =
          err === "permit_expired"
            ? "Permit scaduto"
            : err === "permit_inactive"
              ? "Permit revocato o inattivo"
              : err === "tx_limit"
                ? "Limite per transazione superato (on-chain)"
                : err === "daily_limit"
                  ? "Limite giornaliero superato (on-chain)"
                  : err;
        res.status(403).json({ error: err, message: msg });
        return;
      }
    } else {
      console.log("[bridge/execute] No on-chain permit, using db.json fallback");
    }

    if (!usedOnChainPermit) {
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
    }

    const recipient =
      typeof a.taskConfig?.recipientAddress === "string" && a.taskConfig.recipientAddress.trim()
        ? a.taskConfig.recipientAddress.trim()
        : owner.walletAddress;

    const { keypair } = deriveAgentKeypair(a.ownerProviderId, owner.walletAddress, a.agentIndex);

    const client = new IotaClient({ url: getNodeUrl() });
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [amountNanos]);
    tx.transferObjects([coin], recipient);

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: TX_OPTS,
    });

    if (!usedOnChainPermit) {
      const newSpent = spentToday + amountNanos;
      await db.updateAgentByDid(a.agentDid, {
        spentTodayNanos: newSpent.toString(),
        spentTodayDate: today,
      });
    }

    let remainingDailyBudget: number;
    if (usedOnChainPermit && a.permitObjectId) {
      const info = await getPermitInfo(a.permitObjectId);
      if (info) {
        const rem = BigInt(info.maxPerDay) - BigInt(info.spentToday);
        remainingDailyBudget = Number(rem > 0n ? rem : 0n);
      } else {
        remainingDailyBudget = 0;
      }
    } else {
      remainingDailyBudget = Number(limits.maxPerDay - spentToday - amountNanos);
    }

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
      remainingDailyBudget,
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
    const limits = getPermissionLimits(a);
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

    let permissions: {
      maxPerTx: string;
      maxPerDay: string;
      spentToday: string;
      expiresAt: string | null;
      isActive?: boolean;
      createdAt?: string;
    };

    if (a.permitObjectId) {
      try {
        const onChain = await getPermitInfo(a.permitObjectId);
        if (onChain) {
          permissions = {
            maxPerTx: onChain.maxPerTx,
            maxPerDay: onChain.maxPerDay,
            spentToday: onChain.spentToday,
            expiresAt: onChain.expiresAt === "0" ? null : onChain.expiresAt,
            isActive: onChain.isActive,
            createdAt: onChain.createdAt,
          };
        } else {
          console.warn("[bridge/status] getPermitInfo vuoto, fallback db.json");
          permissions = {
            maxPerTx: limits.maxPerTx.toString(),
            maxPerDay: limits.maxPerDay.toString(),
            spentToday: spentToday.toString(),
            expiresAt:
              a.permitExpiresAtMs && a.permitExpiresAtMs !== "0" ? a.permitExpiresAtMs : null,
          };
        }
      } catch (e) {
        console.warn("[bridge/status] Lettura permit on-chain fallita, fallback db.json:", e);
        permissions = {
          maxPerTx: limits.maxPerTx.toString(),
          maxPerDay: limits.maxPerDay.toString(),
          spentToday: spentToday.toString(),
          expiresAt:
            a.permitExpiresAtMs && a.permitExpiresAtMs !== "0" ? a.permitExpiresAtMs : null,
        };
      }
    } else {
      permissions = {
        maxPerTx: limits.maxPerTx.toString(),
        maxPerDay: limits.maxPerDay.toString(),
        spentToday: spentToday.toString(),
        expiresAt:
          a.permitExpiresAtMs && a.permitExpiresAtMs !== "0" ? a.permitExpiresAtMs : null,
      };
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
      permissions,
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
    if (
      !a ||
      a.ownerProviderId !== jwtUser.providerId ||
      a.ownerProviderType !== jwtUser.providerType
    ) {
      res.status(403).json({ error: "Agente non trovato o non autorizzato" });
      return;
    }
    await db.updateAgentByDid(a.agentDid, { status: "revoked", active: false });
    if (a.permitObjectId) {
      const rev = await revokePermitOnChain(a.permitObjectId);
      if (rev.success && rev.txHash) {
        console.log(`[bridge/revoke] AgentPermit revocato on-chain: ${rev.txHash}`);
      } else {
        console.warn("[bridge/revoke] revoke_permit on-chain fallita:", rev.error ?? "unknown");
      }
    }
    res.json({ status: "revoked" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore revoke";
    res.status(500).json({ error: msg });
  }
});

export default router;
