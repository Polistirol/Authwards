import crypto from "node:crypto";
import { Router } from "express";

import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { createAgentDid } from "../services/did.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import type { AgentTaskConfig, AgentTaskType, DbAgent, PermissionProfile } from "../types/db.js";

const router = Router();

const PROFILES: PermissionProfile[] = ["readonly", "low_value", "full_access"];

function maskToken(t: string | undefined): string | undefined {
  if (!t) return undefined;
  if (t.length <= 16) return "agt_***";
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

function effectiveStatus(a: { status?: string; active?: boolean }): string {
  if (a.status) return a.status;
  if (a.active === false) return "revoked";
  if (a.active === true) return "active";
  return "pending_activation";
}

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

    const taskType = req.body?.taskType as AgentTaskType | undefined;
    const taskConfigBody = req.body?.taskConfig as
      | { shipmentId?: string; recipientAddress?: string; amountNanos?: number }
      | undefined;

    if (taskType === "shipment_monitor" && !taskConfigBody?.shipmentId) {
      res.status(400).json({
        error: "Per taskType shipment_monitor serve taskConfig.shipmentId",
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
        error: "Body richiede { name: string (non vuoto), description?: string }",
      });
      return;
    }

    const user = await db.findUserByGoogleId(jwtUser.googleId);
    if (!user?.walletAddress) {
      res.status(400).json({ error: "walletAddress utente mancante: completa prima l’onboarding OAuth" });
      return;
    }

    const idx = user.nextAgentIndex ?? 0;
    const { keypair } = deriveAgentKeypair(user.googleId, user.walletAddress, idx);

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
      ownerGoogleId: jwtUser.googleId,
      walletAddress,
      DIDCreationTx,
      permissionProfile,
      agentToken,
      agentIndex: idx,
      permitObjectId: null,
      status: "pending_activation",
      activatedAt: null,
      taskType,
      taskConfig,
      createdAt: new Date().toISOString(),
    };

    await db.addAgent(row);
    await db.updateUserByGoogleId(jwtUser.googleId, { nextAgentIndex: idx + 1 });

    res.json({
      agentDid: row.agentDid,
      walletAddress: row.walletAddress,
      agentToken: row.agentToken,
      permissionProfile: row.permissionProfile,
      status: row.status,
      name: row.name,
      description: row.description,
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
    const safe = agents.map((a) => {
      const {
        encryptedPrivateKey: _e,
        iv: _i,
        salt: _s,
        agentToken: tok,
        ...rest
      } = a;
      return {
        ...rest,
        agentToken: maskToken(tok),
        status: effectiveStatus(a),
      };
    });
    res.json(safe);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore lista agenti";
    res.status(500).json({ error: msg });
  }
});

router.get("/:agentDid/snippet", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDid = decodeURIComponent(req.params.agentDid);
    const agent = await db.findAgentByDid(agentDid);
    if (!agent || agent.ownerGoogleId !== jwtUser.googleId) {
      res.status(403).json({ error: "Agente non trovato o non autorizzato" });
      return;
    }
    if (!agent.agentToken) {
      res.status(400).json({ error: "Agente legacy senza agentToken: crea un nuovo agente" });
      return;
    }

    const platformUrl = (process.env.BACKEND_URL ?? `http://localhost:3000`).replace(/\/+$/, "");
    const agentToken = agent.agentToken;

    const snippets = {
      n8n: {
        label: "n8n Workflow",
        description: "Workflow HTTP per n8n",
        steps: [
          "1. Crea un workflow in n8n",
          "2. Aggiungi un nodo Schedule Trigger (ogni 30 secondi)",
          "3. Aggiungi un nodo HTTP Request con questi parametri:",
          `   URL: ${platformUrl}/bridge/check`,
          "   Method: POST",
          `   Header: Authorization: Bearer ${agentToken}`,
          "4. Aggiungi un nodo IF: $json.conditionMet == true",
          "5. Se true, aggiungi un nodo HTTP Request:",
          `   URL: ${platformUrl}/bridge/execute`,
          "   Method: POST",
          `   Header: Authorization: Bearer ${agentToken}`,
          '   Body: {"action": "release_payment"}',
          "6. PRIMA DI TUTTO: attiva l'agente con una chiamata a:",
          `   POST ${platformUrl}/bridge/activate`,
          `   Header: Authorization: Bearer ${agentToken}`,
        ],
        activateCommand: `curl -X POST ${platformUrl}/bridge/activate -H 'Authorization: Bearer ${agentToken}'`,
        checkCommand: `curl -X POST ${platformUrl}/bridge/check -H 'Authorization: Bearer ${agentToken}'`,
        executeCommand: `curl -X POST ${platformUrl}/bridge/execute -H 'Authorization: Bearer ${agentToken}' -H 'Content-Type: application/json' -d '{\"action\": \"release_payment\"}'`,
      },
      curl: {
        label: "cURL (generico)",
        description: "Comandi cURL per test o integrazione custom",
        activate: `curl -X POST ${platformUrl}/bridge/activate \\\n  -H 'Authorization: Bearer ${agentToken}'`,
        check: `curl -X POST ${platformUrl}/bridge/check \\\n  -H 'Authorization: Bearer ${agentToken}'`,
        execute: `curl -X POST ${platformUrl}/bridge/execute \\\n  -H 'Authorization: Bearer ${agentToken}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"action\": \"release_payment\"}'`,
      },
      javascript: {
        label: "JavaScript / Node.js",
        description: "Codice JS per integrazione programmatica",
        code: `const AGENT_TOKEN = '${agentToken}';\nconst API = '${platformUrl}/bridge';\n\n// 1. Attiva l'agente (una volta sola)\nawait fetch(\`\${API}/activate\`, {\n  method: 'POST',\n  headers: { 'Authorization': \`Bearer \${AGENT_TOKEN}\` }\n});\n\n// 2. Controlla la condizione\nconst check = await fetch(\`\${API}/check\`, {\n  method: 'POST',\n  headers: { 'Authorization': \`Bearer \${AGENT_TOKEN}\` }\n}).then(r => r.json());\n\n// 3. Se la condizione è vera, esegui\nif (check.conditionMet) {\n  const result = await fetch(\`\${API}/execute\`, {\n    method: 'POST',\n    headers: {\n      'Authorization': \`Bearer \${AGENT_TOKEN}\`,\n      'Content-Type': 'application/json'\n    },\n    body: JSON.stringify({ action: 'release_payment' })\n  }).then(r => r.json());\n  console.log('TX:', result.txHash);\n}`,
      },
    };

    res.json({
      agentDid: agent.agentDid,
      platformUrl,
      agentToken,
      snippets,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore snippet";
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
