import { Router, type Response } from "express";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import { normalizeIotaAddress } from "@iota/iota-sdk/utils";

import { iotaToNanos, nanosToIota, NANOS_PER_IOTA_BI } from "../constants.js";
import { requireAgentToken } from "../middleware/agentAuth.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import { decryptUserWalletSecret } from "../services/agentCrypto.js";
import * as db from "../services/db.js";
import { getPermissionLimits, utcDateString } from "../services/agentPermissions.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import {
  authorizeSpendOnChain,
  getPermitInfo,
  revokePermitOnChain,
} from "../services/permitContract.js";
import { pickCoinObjectIdForPayment, sponsoredExecute } from "../services/sponsoredTx.js";
import type { AgentStatus, DbAgent } from "../types/db.js";

const router = Router();

/** Bridge transact: gas is sponsored by master; agent pays only the transfer amount from their coin. */
const SPONSORED_TX_GAS_BUDGET = 50_000_000n;

function jsonFail(
  res: Response,
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ success: false, error, message, ...extra });
}

/** DB-only permission check for /bridge/transact (on-chain path uses `authorizeSpendOnChain`). */
function checkDbTransactPermissions(
  a: DbAgent,
  amountNanos: bigint,
  spentToday: bigint,
): { ok: true } | { ok: false; error: string; message: string } {
  const profile = a.permissionProfile;
  if (profile === "readonly") {
    return {
      ok: false,
      error: "readonly_permission",
      message: "Agent has read-only permissions",
    };
  }
  if (profile === "low_value") {
    if (amountNanos > 5n * NANOS_PER_IOTA_BI) {
      return {
        ok: false,
        error: "tx_limit",
        message: "Per-transaction limit exceeded (max 5 IOTA for low_value)",
      };
    }
    if (spentToday + amountNanos > 20n * NANOS_PER_IOTA_BI) {
      return {
        ok: false,
        error: "daily_limit",
        message: "Daily limit exceeded (max 20 IOTA for low_value)",
      };
    }
    return { ok: true };
  }
  const limits = getPermissionLimits(a);
  if (amountNanos > limits.maxPerTx) {
    return {
      ok: false,
      error: "tx_limit",
      message: "Per-transaction limit exceeded",
    };
  }
  if (spentToday + amountNanos > limits.maxPerDay) {
    return {
      ok: false,
      error: "daily_limit",
      message: "Daily limit exceeded",
    };
  }
  return { ok: true };
}

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL not set");
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
    const msg = e instanceof Error ? e.message : "Activate error";
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
    res.json({ conditionMet: false, data: { reason: "no_monitor_config" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Check error";
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

    let amountNanos: bigint;
    if (typeof a.taskConfig?.amountNanos === "number") {
      amountNanos = BigInt(Math.floor(a.taskConfig.amountNanos)); // taskConfig.amountNanos — nanos
    } else {
      amountNanos = 50_000_000n; // 0.05 IOTA in nanos when task amount not specified
    }

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
          "[bridge/execute] On-chain permit not verifiable (network or package not configured), using db.json fallback",
        );
      } else {
        const err = auth.error;
        const msg =
          err === "permit_expired"
            ? "Permit expired"
            : err === "permit_inactive"
              ? "Permit revoked or inactive"
              : err === "tx_limit"
                ? "Per-transaction limit exceeded (on-chain)"
                : err === "daily_limit"
                  ? "Daily limit exceeded (on-chain)"
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
    const from = keypair.getPublicKey().toIotaAddress();

    const client = new IotaClient({ url: getNodeUrl() });
    const coinId = await pickCoinObjectIdForPayment(client, from, amountNanos);
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.object(coinId), [amountNanos]);
    tx.transferObjects([coin], recipient);

    const result = await sponsoredExecute(tx, keypair, client, { gasBudget: SPONSORED_TX_GAS_BUDGET });

    if (!usedOnChainPermit) {
      const newSpent = spentToday + amountNanos;
      await db.updateAgentByDid(a.agentDid, {
        spentTodayNanos: newSpent.toString(),
        spentTodayDate: today,
      });
    }

    let remainingDailyBudgetNanos: bigint;
    if (usedOnChainPermit && a.permitObjectId) {
      const info = await getPermitInfo(a.permitObjectId);
      if (info) {
        const rem = BigInt(info.maxPerDay) - BigInt(info.spentToday);
        remainingDailyBudgetNanos = rem > 0n ? rem : 0n;
      } else {
        remainingDailyBudgetNanos = 0n;
      }
    } else {
      const rem = limits.maxPerDay - spentToday - amountNanos;
      remainingDailyBudgetNanos = rem > 0n ? rem : 0n;
    }

    await db.addAgentLog({
      agentDid: a.agentDid,
      createdAt: new Date().toISOString(),
      message: `bridge_execute ${action}`,
      meta: {
        txHash: result.digest,
        amountNanos: amountNanos.toString(), // nanos
        recipient,
        action,
      },
    });

    res.json({
      success: true,
      txHash: result.digest,
      amountNanos: amountNanos.toString(),
      amountIota: nanosToIota(amountNanos),
      remainingDailyBudgetNanos: remainingDailyBudgetNanos.toString(),
      remainingDailyBudgetIota: nanosToIota(remainingDailyBudgetNanos),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Execute error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Generic IOTA transfer from the agent wallet (sponsored gas).
 * Body: `{ to, amount, unit?: "nanos" | "iota", memo? }` — default **nanos**; use `"unit":"iota"` for human IOTA amounts.
 */
router.post("/transact", requireAgentToken, async (req, res) => {
  try {
    const a = req.agent!;
    const st = effectiveStatus(a);
    if (st === "revoked") {
      jsonFail(res, 403, "agent_revoked", "Agent revoked");
      return;
    }
    if (st !== "active") {
      jsonFail(res, 403, "agent_not_activated", "Agent must be activated from the dashboard");
      return;
    }
    if (!requireBridgeAgent(a)) {
      jsonFail(res, 400, "legacy_agent", "Agent must use Agent Bridge (re-create agent)");
      return;
    }

    const rawTo = req.body?.to;
    const rawAmount = req.body?.amount;
    const memoRaw = req.body?.memo;
    /** Default `nanos`; use `iota` for human amounts (e.g. 5 = 5 IOTA). */
    const unitRaw = req.body?.unit;
    const unit = unitRaw === "iota" ? "iota" : "nanos";

    if (typeof rawTo !== "string" || !rawTo.trim()) {
      jsonFail(res, 400, "invalid_body", 'Missing or invalid "to" address');
      return;
    }
    let to: string;
    try {
      to = normalizeIotaAddress(rawTo.trim(), false, true);
    } catch {
      jsonFail(res, 400, "invalid_address", "Invalid IOTA address");
      return;
    }

    const amountNum =
      typeof rawAmount === "number"
        ? rawAmount
        : typeof rawAmount === "string"
          ? Number.parseFloat(rawAmount)
          : Number.NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      jsonFail(res, 400, "invalid_body", "amount must be a positive number");
      return;
    }
    const amountNanos =
      unit === "iota" ? iotaToNanos(amountNum) : BigInt(Math.floor(amountNum));
    if (amountNanos <= 0n) {
      jsonFail(res, 400, "invalid_body", "amount must be a positive number");
      return;
    }

    if (memoRaw !== undefined && memoRaw !== null) {
      if (typeof memoRaw !== "string") {
        jsonFail(res, 400, "invalid_body", "memo must be a string");
        return;
      }
      if (memoRaw.length > 256) {
        jsonFail(res, 400, "memo_too_long", "memo must be at most 256 characters");
        return;
      }
    }
    const memo = typeof memoRaw === "string" ? memoRaw : undefined;

    const owner = await db.findUserByProvider(a.ownerProviderId, a.ownerProviderType);
    if (!owner?.walletAddress) {
      jsonFail(res, 400, "owner_wallet_missing", "Owner wallet unavailable");
      return;
    }

    const { keypair } = deriveAgentKeypair(a.ownerProviderId, owner.walletAddress, a.agentIndex);
    const from = keypair.getPublicKey().toIotaAddress();

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
          "[bridge/transact] On-chain permit not verifiable (network or package not configured), using db.json fallback",
        );
      } else {
        const err = auth.error;
        const msg =
          err === "permit_expired"
            ? "Permit expired"
            : err === "permit_inactive"
              ? "Permit revoked or inactive"
              : err === "tx_limit"
                ? "Per-transaction limit exceeded (on-chain)"
                : err === "daily_limit"
                  ? "Daily limit exceeded (on-chain)"
                  : err;
        jsonFail(res, 403, err, msg);
        return;
      }
    }

    if (!usedOnChainPermit) {
      const dbCheck = checkDbTransactPermissions(a, amountNanos, spentToday);
      if (!dbCheck.ok) {
        jsonFail(res, 403, dbCheck.error, dbCheck.message);
        return;
      }
    }

    const client = new IotaClient({ url: getNodeUrl() });
    const { totalBalance } = await client.getBalance({ owner: from });
    const balanceNanos = BigInt(totalBalance);
    if (balanceNanos < amountNanos) {
      jsonFail(res, 400, "insufficient_balance", "Insufficient balance", {
        walletBalanceNanos: balanceNanos.toString(),
        walletBalanceIota: nanosToIota(balanceNanos),
      });
      return;
    }

    const coinId = await pickCoinObjectIdForPayment(client, from, amountNanos);
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.object(coinId), [amountNanos]);
    tx.transferObjects([coin], to);

    const result = await sponsoredExecute(tx, keypair, client, { gasBudget: SPONSORED_TX_GAS_BUDGET });

    if (!usedOnChainPermit) {
      const newSpent = spentToday + amountNanos;
      await db.updateAgentByDid(a.agentDid, {
        spentTodayNanos: newSpent.toString(),
        spentTodayDate: today,
      });
    }

    const { totalBalance: afterBal } = await client.getBalance({ owner: from });
    const balanceAfterNanos = BigInt(afterBal);

    let remainingDailyBudgetNanos: bigint;
    if (usedOnChainPermit && a.permitObjectId) {
      const info = await getPermitInfo(a.permitObjectId);
      if (info) {
        const rem = BigInt(info.maxPerDay) - BigInt(info.spentToday);
        remainingDailyBudgetNanos = rem > 0n ? rem : 0n;
      } else {
        remainingDailyBudgetNanos = 0n;
      }
    } else {
      const newSpent = spentToday + amountNanos;
      const limits = getPermissionLimits(a);
      if (a.permissionProfile === "low_value") {
        const rem = 20n * NANOS_PER_IOTA_BI - newSpent;
        remainingDailyBudgetNanos = rem > 0n ? rem : 0n;
      } else {
        const rem = limits.maxPerDay - newSpent;
        remainingDailyBudgetNanos = rem > 0n ? rem : 0n;
      }
    }

    await db.addAgentLog({
      agentDid: a.agentDid,
      createdAt: new Date().toISOString(),
      message: "bridge_transact",
      meta: {
        type: "transact",
        txHash: result.digest,
        to,
        amountNanos: amountNanos.toString(),
        amountIota: nanosToIota(amountNanos),
        unit,
        memo: memo ?? null,
        walletBalanceIota: nanosToIota(balanceAfterNanos),
      },
    });

    res.json({
      success: true,
      txHash: result.digest,
      from,
      to,
      amountNanos: amountNanos.toString(),
      amountIota: nanosToIota(amountNanos),
      unit,
      memo: memo ?? null,
      remainingDailyBudgetNanos: remainingDailyBudgetNanos.toString(),
      remainingDailyBudgetIota: nanosToIota(remainingDailyBudgetNanos),
      walletBalanceNanos: balanceAfterNanos.toString(),
      walletBalanceIota: nanosToIota(balanceAfterNanos),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transact error";
    jsonFail(res, 500, "server_error", msg);
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
    let balanceIota = 0;
    if (a.walletAddress) {
      const client = new IotaClient({ url: getNodeUrl() });
      const { totalBalance } = await client.getBalance({ owner: a.walletAddress });
      balance = totalBalance;
      balanceIota = nanosToIota(BigInt(totalBalance));
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
          console.warn("[bridge/status] getPermitInfo empty, db.json fallback");
          permissions = {
            maxPerTx: limits.maxPerTx.toString(),
            maxPerDay: limits.maxPerDay.toString(),
            spentToday: spentToday.toString(),
            expiresAt:
              a.permitExpiresAtMs && a.permitExpiresAtMs !== "0" ? a.permitExpiresAtMs : null,
          };
        }
      } catch (e) {
        console.warn("[bridge/status] On-chain permit read failed, db.json fallback:", e);
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
      balanceNanos: balance,
      balanceIota,
      permitObjectId: a.permitObjectId ?? null,
      activatedAt: a.activatedAt ?? null,
      createdAt: a.createdAt,
      taskType: a.taskType,
      taskConfig: a.taskConfig,
      permissions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Status error";
    res.status(500).json({ error: msg });
  }
});

router.post("/revoke", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDid = req.body?.agentDid;
    if (typeof agentDid !== "string" || !agentDid.trim()) {
      res.status(400).json({ error: "Body requires { agentDid: string }" });
      return;
    }
    const a = await db.findAgentByDid(agentDid.trim());
    if (
      !a ||
      a.ownerProviderId !== jwtUser.providerId ||
      a.ownerProviderType !== jwtUser.providerType
    ) {
      res.status(403).json({ error: "Agent not found or not authorized" });
      return;
    }
    await db.updateAgentByDid(a.agentDid, { status: "revoked", active: false });
    if (a.permitObjectId) {
      const owner = await db.findUserByProvider(jwtUser.providerId, jwtUser.providerType);
      if (owner?.encryptedPrivateKey && owner.iv && owner.salt) {
        try {
          const ownerKp = Ed25519Keypair.fromSecretKey(decryptUserWalletSecret(owner));
          const rev = await revokePermitOnChain(a.permitObjectId, ownerKp);
          if (rev.success && rev.txHash) {
            console.log(`[bridge/revoke] AgentPermit revoked on-chain: ${rev.txHash}`);
          } else {
            console.warn("[bridge/revoke] revoke_permit on-chain failed:", rev.error ?? "unknown");
          }
        } catch (e) {
          console.warn("[bridge/revoke] revoke_permit on-chain error:", e);
        }
      } else {
        console.warn("[bridge/revoke] skip on-chain revoke: user wallet key not on server");
      }
    }
    res.json({ status: "revoked" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Revoke error";
    res.status(500).json({ error: msg });
  }
});

export default router;
