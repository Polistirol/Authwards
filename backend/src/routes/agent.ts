import crypto from "node:crypto";
import { Router } from "express";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";

import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { createAgentDid, ed25519SeedFromPrivateKey } from "../services/did.js";
import { encryptAgentPrivateKey } from "../services/agentCrypto.js";
import type { PermissionProfile } from "../types/db.js";

const router = Router();

const PROFILES: PermissionProfile[] = ["readonly", "low_value", "full_access"];

router.post("/create", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const permissionProfile = req.body?.permissionProfile as PermissionProfile | undefined;
    if (!permissionProfile || !PROFILES.includes(permissionProfile)) {
      res.status(400).json({
        error: 'Body richiede { permissionProfile: "readonly" | "low_value" | "full_access" }',
      });
      return;
    }

    const { privateKey: agentPriv } = crypto.generateKeyPairSync("ed25519");
    const payerKeypair = Ed25519Keypair.generate();
    const { did: agentDid } = await createAgentDid({
      payerKeypair,
      agentPrivateKey: agentPriv,
      ownerDid: jwtUser.did,
      fundPayer: true,
    });

    const seed = ed25519SeedFromPrivateKey(agentPriv);
    const { encryptedPrivateKey, iv, salt } = encryptAgentPrivateKey(agentDid, seed);

    const row = {
      agentDid,
      ownerDid: jwtUser.did,
      ownerGoogleId: jwtUser.googleId,
      permissionProfile,
      encryptedPrivateKey,
      iv,
      salt,
      createdAt: new Date().toISOString(),
      active: true,
    };
    await db.addAgent(row);

    res.json({
      agentDid: row.agentDid,
      ownerDid: row.ownerDid,
      permissionProfile: row.permissionProfile,
      createdAt: row.createdAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore creazione agente";
    res.status(500).json({ error: msg });
  }
});

router.get("/list", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agents = await db.findAgentsByOwner(jwtUser.googleId);
    const safe = agents.map(({ encryptedPrivateKey: _e, iv: _i, salt: _s, ...rest }) => rest);
    res.json(safe);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore lista agenti";
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
    if (!agent || agent.ownerGoogleId !== jwtUser.googleId) {
      res.status(403).json({ error: "Agente non trovato o non autorizzato" });
      return;
    }

    const logs = await db.getAgentLogs(agentDid, limit);
    res.json(logs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore log agente";
    res.status(500).json({ error: msg });
  }
});

export default router;
