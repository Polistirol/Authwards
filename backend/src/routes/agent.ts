import crypto from "node:crypto";
import { Router } from "express";

import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { createAgentDid } from "../services/did.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import { buildAgentSnippetPayload } from "../services/agentSnippetProviders.js";
import {
  createPermitOnChain,
  isPermitContractConfigured,
  permitExplorerUrl,
  reactivatePermitOnChain,
} from "../services/permitContract.js";
import type { AgentTaskConfig, AgentTaskType, DbAgent, PermissionProfile } from "../types/db.js";

const router = Router();

const PROFILES: PermissionProfile[] = ["readonly", "custom", "full_access", "low_value"];

function parsePermitExpiresAtMs(body: Record<string, unknown>): bigint {
  const v = body.permitExpiresAtMs;
  if (v === null || v === undefined || v === "") return 0n;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.floor(v);
    return n <= 0 ? 0n : BigInt(n);
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "0") return 0n;
    if (/^\d+$/.test(t)) return BigInt(t);
  }
  return 0n;
}

function resolvePermitIotaLimits(
  profile: PermissionProfile,
  body: Record<string, unknown>,
): { ok: true; maxPerTx: string; maxPerDay: string } | { ok: false; error: string } {
  if (profile === "readonly") {
    return { ok: true, maxPerTx: "0", maxPerDay: "0" };
  }
  if (profile === "full_access") {
    return { ok: true, maxPerTx: "1000", maxPerDay: "10000" };
  }
  if (profile === "low_value") {
    return { ok: true, maxPerTx: "5", maxPerDay: "20" };
  }
  if (profile === "custom") {
    const tx = body.customMaxPerTxIota;
    const day = body.customMaxPerDayIota;
    const nTx = typeof tx === "number" ? tx : typeof tx === "string" ? parseFloat(tx) : NaN;
    const nDay = typeof day === "number" ? day : typeof day === "string" ? parseFloat(day) : NaN;
    if (!Number.isFinite(nTx) || !Number.isFinite(nDay) || nTx < 0 || nDay < 0) {
      return {
        ok: false,
        error: "For permissionProfile custom, customMaxPerTxIota and customMaxPerDayIota are required (numbers >= 0)",
      };
    }
    const maxTx = Math.floor(nTx);
    const maxDay = Math.floor(nDay);
    if (maxTx > 1_000_000_000 || maxDay > 1_000_000_000) {
      return { ok: false, error: "Custom limits out of range (max 1e9 IOTA per field)" };
    }
    return { ok: true, maxPerTx: String(maxTx), maxPerDay: String(maxDay) };
  }
  return { ok: false, error: "permissionProfile is invalid" };
}

function maskToken(t: string | undefined): string | undefined {
  if (!t) return undefined;
  if (t.length <= 16) return "agt_***";
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

function effectiveStatus(a: { status?: string; active?: boolean }): string {
  if (a.status === "pending_activation") return "created";
  if (a.status) return a.status;
  if (a.active === false) return "revoked";
  if (a.active === true) return "active";
  return "created";
}

router.post("/create", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const permissionProfile = req.body?.permissionProfile as PermissionProfile | undefined;
    if (!permissionProfile || !PROFILES.includes(permissionProfile)) {
      res.status(400).json({
        error:
          'Body requires { permissionProfile: "readonly" | "custom" | "full_access" | "low_value" }',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const limits = resolvePermitIotaLimits(permissionProfile, body);
    if (!limits.ok) {
      res.status(400).json({ error: limits.error });
      return;
    }
    const permitExpiresAtMs = parsePermitExpiresAtMs(body);

    const taskType = req.body?.taskType as AgentTaskType | undefined;
    const taskConfigBody = req.body?.taskConfig as
      | { shipmentId?: string; recipientAddress?: string; amountNanos?: number }
      | undefined;

    if (taskType === "shipment_monitor" && !taskConfigBody?.shipmentId) {
      res.status(400).json({
        error: "taskType shipment_monitor requires taskConfig.shipmentId",
      });
      return;
    }

    const rawName = req.body?.name;
    const rawDesc = req.body?.description;
    const name =
      typeof rawName === "string" ? rawName.trim().slice(0, 120) : "";
    const description =
      typeof rawDesc === "string" ? rawDesc.trim().slice(0, 2000) : "";
    if (!name) {
      res.status(400).json({
        error: "Body requires { name: string (non-empty), description?: string }",
      });
      return;
    }

    const user = await db.findUserByProvider(jwtUser.providerId, jwtUser.providerType);
    if (!user?.walletAddress) {
      res.status(400).json({ error: "Missing user walletAddress: complete OAuth onboarding first" });
      return;
    }

    const idx = user.nextAgentIndex ?? 0;
    const { keypair } = deriveAgentKeypair(user.providerId, user.walletAddress, idx);

    const { did: agentDid, walletAddress, DIDCreationTx } = await createAgentDid({
      agentKeypair: keypair,
      ownerDid: jwtUser.did,
    });

    const agentToken = `agt_${crypto.randomBytes(24).toString("hex")}`;

    let taskConfig: AgentTaskConfig | undefined;
    if (taskType === "shipment_monitor" && taskConfigBody?.shipmentId) {
      taskConfig = {
        shipmentId: taskConfigBody.shipmentId,
        action: "release_payment",
        recipientAddress: taskConfigBody.recipientAddress,
        amountNanos: taskConfigBody.amountNanos,
      };
    }

    const row: DbAgent = {
      agentDid,
      name,
      description,
      ownerDid: jwtUser.did,
      ownerProviderId: jwtUser.providerId,
      ownerProviderType: jwtUser.providerType,
      walletAddress,
      DIDCreationTx,
      permissionProfile,
      permitMaxPerTxIota: limits.maxPerTx,
      permitMaxPerDayIota: limits.maxPerDay,
      permitExpiresAtMs: permitExpiresAtMs.toString(),
      agentToken,
      agentIndex: idx,
      permitObjectId: null,
      status: "created",
      activatedAt: null,
      taskType,
      taskConfig,
      createdAt: new Date().toISOString(),
    };

    await db.addAgent(row);
    await db.updateUserByProvider(jwtUser.providerId, jwtUser.providerType, { nextAgentIndex: idx + 1 });

    let permitObjectId: string | null = null;
    if (isPermitContractConfigured()) {
      try {
        const created = await createPermitOnChain({
          agentDid,
          ownerDid: jwtUser.did,
          maxPerTx: BigInt(limits.maxPerTx),
          maxPerDay: BigInt(limits.maxPerDay),
          expiresAtMs: permitExpiresAtMs,
        });
        permitObjectId = created.permitObjectId;
        await db.updateAgentByDid(agentDid, { permitObjectId });
        console.log(
          `[agent/create] AgentPermit on-chain created: ${permitObjectId} (tx ${created.txHash})`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[agent/create] On-chain AgentPermit creation failed (db.json fallback):", msg);
      }
    } else {
      console.log("AgentPermit contract not configured, skipping on-chain permit");
    }

    res.json({
      agentDid: row.agentDid,
      walletAddress: row.walletAddress,
      agentToken: row.agentToken,
      status: "created",
      name: row.name,
      description: row.description ?? "",
      permitObjectId,
      permitExplorerUrl: permitObjectId ? permitExplorerUrl(permitObjectId) : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent creation error";
    res.status(500).json({ error: msg });
  }
});

router.get("/list", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agents = await db.findAgentsByOwner(jwtUser.providerId, jwtUser.providerType);
    const safe = agents.map((a) => {
      const {
        encryptedPrivateKey: _e,
        iv: _i,
        salt: _s,
        agentToken: tok,
        ...rest
      } = a;
      const pid = a.permitObjectId ?? null;
      return {
        ...rest,
        agentToken: maskToken(tok),
        status: effectiveStatus(a),
        permitObjectId: pid,
        permitExplorerUrl: pid ? permitExplorerUrl(pid) : null,
      };
    });
    res.json(safe);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent list error";
    res.status(500).json({ error: msg });
  }
});

router.post("/:agentDid/activate", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDid = decodeURIComponent(req.params.agentDid);
    const a = await db.findAgentByDid(agentDid);
    if (!a || a.ownerProviderId !== jwtUser.providerId || a.ownerProviderType !== jwtUser.providerType) {
      res.status(403).json({ error: "Agent not found or not authorized" });
      return;
    }
    const st = effectiveStatus(a);
    if (st === "active") {
      res.status(400).json({ error: "already_active", message: "Agent is already active" });
      return;
    }
    if (st === "revoked") {
      res.status(400).json({ error: "agent_revoked", message: "Cannot activate a revoked agent" });
      return;
    }
    if (st !== "created") {
      res.status(400).json({ error: "invalid_status", message: "Agent must be in created state" });
      return;
    }

    if (isPermitContractConfigured() && a.permitObjectId) {
      const react = await reactivatePermitOnChain(a.permitObjectId);
      if (!react.success) {
        console.warn("[agent/activate] reactivate_permit on-chain:", react.error ?? "unknown");
      } else if (react.txHash) {
        console.log(`[agent/activate] AgentPermit reactivate_permit on-chain tx: ${react.txHash}`);
      }
    }

    const activatedAt = new Date().toISOString();
    await db.updateAgentByDid(a.agentDid, {
      status: "active",
      activatedAt,
      active: true,
    });

    res.json({
      status: "active",
      agentDid: a.agentDid,
      activatedAt,
      permitObjectId: a.permitObjectId ?? null,
      message: "Agent activated successfully",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Activation error";
    res.status(500).json({ error: msg });
  }
});

router.get("/:agentDid/snippet", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDid = decodeURIComponent(req.params.agentDid);
    const agent = await db.findAgentByDid(agentDid);
    if (
      !agent ||
      agent.ownerProviderId !== jwtUser.providerId ||
      agent.ownerProviderType !== jwtUser.providerType
    ) {
      res.status(403).json({ error: "Agent not found or not authorized" });
      return;
    }
    if (!agent.agentToken) {
      res.status(400).json({ error: "Legacy agent without agentToken: create a new agent" });
      return;
    }

    const platformUrl = (process.env.BACKEND_URL ?? `http://localhost:3000`).replace(/\/+$/, "");

    res.json(buildAgentSnippetPayload(agent, platformUrl));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Snippet error";
    res.status(500).json({ error: msg });
  }
});

router.get("/logs/:agentDid", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const { agentDid } = req.params;
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === "string" ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;

    const agent = await db.findAgentByDid(agentDid);
    if (
      !agent ||
      agent.ownerProviderId !== jwtUser.providerId ||
      agent.ownerProviderType !== jwtUser.providerType
    ) {
      res.status(403).json({ error: "Agent not found or not authorized" });
      return;
    }

    const logs = await db.getAgentLogs(agentDid, limit);
    res.json(logs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent log error";
    res.status(500).json({ error: msg });
  }
});

export default router;
