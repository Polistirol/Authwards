import { Router, type Request, type Response } from "express";

import { mergeDbInitIntoExisting, readDb, replaceDbFromPayload, resetDbFromInit } from "../services/db.js";
import { getMasterAddress, getMasterBalanceNanos } from "../services/masterWallet.js";

const router = Router();

function devActionSecret(): string | undefined {
  return process.env.DEV_ACTION_SECRET?.trim();
}

/** Stesso meccanismo per merge DB, reset DB, lettura/scrittura db.json. */
function devActionAuthOk(req: Request): boolean {
  const secret = devActionSecret();
  if (!secret) return false;
  const header = (req.headers["x-dev-action-secret"] as string | undefined)?.trim();
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  return header === secret || bearer === secret;
}

function devActionsDisabledResponse(res: Response): void {
  res.status(503).json({
    error: "Dev actions disabled",
    hint: "Set DEV_ACTION_SECRET to enable merge/reset/db-json; remove in production when not needed.",
  });
}

/** Debug: master wallet and airdrop status (no JWT). */
router.get("/master-status", async (_req, res) => {
  try {
    const nanos = await getMasterBalanceNanos();
    res.json({
      address: getMasterAddress(),
      balance: nanos.toString(),
      balanceIota: Number(nanos) / 1e9,
      airdropEnabled: process.env.WELCOME_AIRDROP_ENABLED?.toLowerCase() === "true",
      airdropAmount: process.env.WELCOME_AIRDROP_AMOUNT ?? "0",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Merges `db_init.json` into existing `db.json`: only appends shipments with new `id` values.
 * Requires `DEV_ACTION_SECRET` + `X-Dev-Action-Secret` or `Authorization: Bearer`.
 */
router.post("/merge-db-init", async (req, res) => {
  try {
    if (!devActionSecret()) {
      devActionsDisabledResponse(res);
      return;
    }
    if (!devActionAuthOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const r = await mergeDbInitIntoExisting();
    res.json({
      ok: true,
      addedShipments: r.addedShipments,
      changed: r.changed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Overwrites `db.json` from `db_init.json` (or empty DB if init missing).
 * Requires `DEV_ACTION_SECRET` + auth header.
 */
router.post("/reset-db-from-init", async (req, res) => {
  try {
    if (!devActionSecret()) {
      devActionsDisabledResponse(res);
      return;
    }
    if (!devActionAuthOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const r = await resetDbFromInit();
    res.json({ ok: true, source: r.source });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Reads full normalized `db.json` (users, agents, agentLogs, shipments).
 * Requires `DEV_ACTION_SECRET` + auth header.
 */
router.get("/db-json", async (req, res) => {
  try {
    if (!devActionSecret()) {
      devActionsDisabledResponse(res);
      return;
    }
    if (!devActionAuthOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const db = await readDb();
    res.json(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Replaces entire `db.json` with request body (same schema). Uses `normalizeDb` migrations.
 */
router.put("/db-json", async (req, res) => {
  try {
    if (!devActionSecret()) {
      devActionsDisabledResponse(res);
      return;
    }
    if (!devActionAuthOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({ error: "Expected JSON object body" });
      return;
    }
    const shape = await replaceDbFromPayload(req.body);
    res.json({
      ok: true,
      counts: {
        users: shape.users.length,
        agents: shape.agents.length,
        agentLogs: shape.agentLogs.length,
        shipments: shape.shipments.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(400).json({ error: msg });
  }
});

export default router;
