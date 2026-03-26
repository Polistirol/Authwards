import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { IotaClient } from "@iota/iota-sdk/client";

import { Agent, persistAndBroadcastLog, type AgentLogger } from "./agent.js";
import * as db from "./services/db.js";
import type { DbAgent } from "./types/db.js";
import { createWsLogger, type AgentLogType } from "./ws-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const PBKDF2_ITERATIONS = 210_000;

function decryptAgentPrivateKey(
  agentDid: string,
  encryptedPrivateKeyB64: string,
  ivB64: string,
  saltB64: string,
  jwtSecret: string,
): Uint8Array {
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const combined = Buffer.from(encryptedPrivateKeyB64, "base64");
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);

  const key = crypto.pbkdf2Sync(`${jwtSecret}${agentDid}`, salt, PBKDF2_ITERATIONS, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

const AGENT_POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS ?? "5000");
const AGENT_DB_POLL_MS = Number(process.env.AGENT_DB_POLL_MS ?? "10000");
const WS_PORT = Number(process.env.AGENT_WS_PORT ?? "8080");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} non configurato`);
  return v;
}

async function main(): Promise<void> {
  const jwtSecret = requireEnv("JWT_SECRET");
  const nodeUrl = requireEnv("IOTA_NODE_URL");
  /** Destinatario demo (treasury o wallet owner); obbligatorio per `execute`. */
  const payoutAddress =
    process.env.AGENT_PAYOUT_ADDRESS?.trim() ||
    process.env.IOTA_TREASURY_ADDRESS?.trim() ||
    "";
  if (!payoutAddress) {
    console.warn(
      "[agent-runtime] AGENT_PAYOUT_ADDRESS (o IOTA_TREASURY_ADDRESS) non impostato: le tx in trigger falliranno finché non configuri un indirizzo destinatario.",
    );
  }

  await db.ensureDbFile();

  const iotaClient = new IotaClient({ url: nodeUrl });
  const { broadcast, close: closeWs } = createWsLogger(WS_PORT);
  console.log(`[agent-runtime] WebSocket log server in ascolto sulla porta ${WS_PORT}`);

  const running = new Map<string, Agent>();
  /** Evita di riscrivere in `db.json` lo stesso errore decrypt a ogni poll DB (10s). */
  const decryptFailPersisted = new Set<string>();

  function makeLogger(agentDid: string): AgentLogger {
    const log = async (type: AgentLogType, data: unknown): Promise<void> => {
      console.log(`[${agentDid.slice(-8)}] ${type}`, data);
      await persistAndBroadcastLog(broadcast, agentDid, type, data);
    };
    return { log, iotaClient, payoutAddress };
  }

  async function startAgentFromRow(row: DbAgent): Promise<void> {
    if (running.has(row.agentDid)) return;
    if (!row.encryptedPrivateKey || !row.iv || !row.salt) {
      console.error(`[agent-runtime] Agent ${row.agentDid} senza chiave cifrata nel DB, skip`);
      return;
    }
    let seed: Uint8Array;
    try {
      seed = decryptAgentPrivateKey(
        row.agentDid,
        row.encryptedPrivateKey,
        row.iv,
        row.salt,
        jwtSecret,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[agent-runtime] Decifratura fallita per ${row.agentDid}:`, err);
      if (!decryptFailPersisted.has(row.agentDid)) {
        decryptFailPersisted.add(row.agentDid);
        await persistAndBroadcastLog(broadcast, row.agentDid, "error", {
          phase: "decrypt",
          error: err,
        });
      }
      return;
    }

    const agent = new Agent(row, seed, makeLogger(row.agentDid));
    running.set(row.agentDid, agent);
    agent.start(AGENT_POLL_INTERVAL_MS);
  }

  async function syncAgentsFromDb(): Promise<void> {
    const data = await db.readDb();
    const activeRows = data.agents.filter((a) => a.active);

    for (const did of [...running.keys()]) {
      const still = activeRows.find((a) => a.agentDid === did);
      if (!still) {
        running.get(did)?.stop();
        running.delete(did);
        console.log(`[agent-runtime] Agente fermato (non più attivo): ${did}`);
      }
    }

    for (const row of activeRows) {
      await startAgentFromRow(row);
    }
  }

  await syncAgentsFromDb();
  const dbPoll = setInterval(() => {
    void syncAgentsFromDb().catch((e) => console.error("[agent-runtime] syncAgentsFromDb:", e));
  }, AGENT_DB_POLL_MS);

  const shutdown = (): void => {
    clearInterval(dbPoll);
    for (const a of running.values()) a.stop();
    running.clear();
    closeWs();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
