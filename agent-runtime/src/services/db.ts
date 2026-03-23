import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type { DbAgent, DbAgentLog, DbShape, DbShipment, DbUser } from "../types/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: `agent-runtime/src/services` → `../../../` */
export const DB_PATH = path.resolve(__dirname, "../../../db.json");

const emptyDb = (): DbShape => ({
  users: [],
  agents: [],
  agentLogs: [],
  shipments: [],
});

function normalizeDb(parsed: unknown): DbShape {
  if (!parsed || typeof parsed !== "object") return emptyDb();
  const o = parsed as Record<string, unknown>;
  return {
    users: Array.isArray(o.users) ? (o.users as DbUser[]) : [],
    agents: Array.isArray(o.agents) ? (o.agents as DbAgent[]) : [],
    agentLogs: Array.isArray(o.agentLogs) ? (o.agentLogs as DbAgentLog[]) : [],
    shipments: Array.isArray(o.shipments) ? (o.shipments as DbShipment[]) : [],
  };
}

function needsDbRepair(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return true;
  const o = parsed as Record<string, unknown>;
  return (
    !Array.isArray(o.users) ||
    !Array.isArray(o.agents) ||
    !Array.isArray(o.agentLogs) ||
    !Array.isArray(o.shipments)
  );
}

export async function ensureDbFile(): Promise<void> {
  const exists = await fs.pathExists(DB_PATH);
  if (!exists) {
    await fs.writeJson(DB_PATH, emptyDb(), { spaces: 2 });
    return;
  }
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (needsDbRepair(parsed)) {
      await writeDb(normalizeDb(parsed));
    }
  } catch {
    await fs.writeJson(DB_PATH, emptyDb(), { spaces: 2 });
  }
}

export async function readDb(): Promise<DbShape> {
  const raw = await fs.readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeDb(parsed);
}

export async function writeDb(data: DbShape): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function findUserByGoogleId(googleId: string): Promise<DbUser | undefined> {
  const db = await readDb();
  return db.users.find((u) => u.googleId === googleId);
}

export async function findUserByDid(did: string): Promise<DbUser | undefined> {
  const db = await readDb();
  return db.users.find((u) => u.did === did);
}

export async function findAgentsByOwner(googleId: string): Promise<DbAgent[]> {
  const db = await readDb();
  return db.agents.filter((a) => a.ownerGoogleId === googleId);
}

export async function findAgentByDid(agentDid: string): Promise<DbAgent | undefined> {
  const db = await readDb();
  return db.agents.find((a) => a.agentDid === agentDid);
}

function logPayloadForCompare(l: DbAgentLog): { kind: string; payload: unknown } {
  const kind = String(l.type ?? l.message ?? "");
  const payload = l.data !== undefined ? l.data : l.meta;
  return { kind, payload };
}

function isSameLogContent(a: DbAgentLog, b: DbAgentLog): boolean {
  const pa = logPayloadForCompare(a);
  const pb = logPayloadForCompare(b);
  return pa.kind === pb.kind && isDeepStrictEqual(pa.payload, pb.payload);
}

/**
 * Aggiunge un log; se coincide con l’ultimo log dello stesso agente (stesso tipo + stessi dati),
 * sostituisce quella riga aggiornando solo `createdAt` — evita righe duplicate quando cambia solo il timestamp.
 */
export async function addAgentLog(log: DbAgentLog): Promise<void> {
  const db = await readDb();
  let lastIdx = -1;
  for (let i = db.agentLogs.length - 1; i >= 0; i--) {
    if (db.agentLogs[i].agentDid === log.agentDid) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx >= 0 && isSameLogContent(db.agentLogs[lastIdx], log)) {
    const prev = db.agentLogs[lastIdx];
    db.agentLogs[lastIdx] = {
      ...prev,
      createdAt: log.createdAt,
      type: log.type ?? prev.type,
      data: log.data !== undefined ? log.data : prev.data,
      message: log.message ?? prev.message,
      meta: log.meta !== undefined ? log.meta : prev.meta,
    };
  } else {
    db.agentLogs.push(log);
  }
  await writeDb(db);
}

export async function getAgentLogs(agentDid: string, limit = 50): Promise<DbAgentLog[]> {
  const db = await readDb();
  const filtered = db.agentLogs.filter((l) => l.agentDid === agentDid);
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered.slice(0, limit);
}

export async function getShipment(shipmentId: string): Promise<DbShipment | undefined> {
  const db = await readDb();
  return db.shipments.find((s) => s.id === shipmentId);
}

export async function updateShipmentStatus(shipmentId: string, newStatus: string): Promise<void> {
  const db = await readDb();
  const s = db.shipments.find((x) => x.id === shipmentId);
  if (!s) throw new Error(`Spedizione non trovata: ${shipmentId}`);
  s.status = newStatus;
  await writeDb(db);
}
