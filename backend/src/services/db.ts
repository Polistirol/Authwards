import fs from "fs-extra";

import type { DbAgent, DbAgentLog, DbShape, DbShipment, DbUser } from "../types/db.js";
import { DB_PATH } from "../paths.js";

const emptyDb = (): DbShape => ({
  users: [],
  agents: [],
  agentLogs: [],
  shipments: [],
});

function normalizeDb(parsed: unknown): DbShape {
  if (!parsed || typeof parsed !== "object") return emptyDb();
  const o = parsed as Record<string, unknown>;
  const usersRaw = Array.isArray(o.users) ? (o.users as DbUser[]) : [];
  const users = usersRaw.map((u) => ({
    ...u,
    nextAgentIndex: u.nextAgentIndex ?? 0,
  }));
  return {
    users,
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

export async function addUser(user: DbUser): Promise<void> {
  const db = await readDb();
  db.users.push(user);
  await writeDb(db);
}

export async function findAgentsByOwner(googleId: string): Promise<DbAgent[]> {
  const db = await readDb();
  return db.agents.filter((a) => a.ownerGoogleId === googleId);
}

export async function addAgent(agent: DbAgent): Promise<void> {
  const db = await readDb();
  db.agents.push(agent);
  await writeDb(db);
}

export async function addAgentLog(log: DbAgentLog): Promise<void> {
  const db = await readDb();
  db.agentLogs.push(log);
  await writeDb(db);
}

export async function getAgentLogs(agentDid: string, limit = 50): Promise<DbAgentLog[]> {
  const db = await readDb();
  const filtered = db.agentLogs.filter((l) => l.agentDid === agentDid);
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered.slice(0, limit);
}

export async function findAgentByDid(agentDid: string): Promise<DbAgent | undefined> {
  const db = await readDb();
  return db.agents.find((a) => a.agentDid === agentDid);
}

export async function findAgentByToken(agentToken: string): Promise<DbAgent | undefined> {
  const db = await readDb();
  return db.agents.find((a) => a.agentToken === agentToken);
}

export async function updateUserByGoogleId(googleId: string, patch: Partial<DbUser>): Promise<boolean> {
  const db = await readDb();
  const i = db.users.findIndex((u) => u.googleId === googleId);
  if (i < 0) return false;
  db.users[i] = { ...db.users[i], ...patch };
  await writeDb(db);
  return true;
}

export async function updateAgentByDid(agentDid: string, patch: Partial<DbAgent>): Promise<boolean> {
  const db = await readDb();
  const i = db.agents.findIndex((a) => a.agentDid === agentDid);
  if (i < 0) return false;
  db.agents[i] = { ...db.agents[i], ...patch };
  await writeDb(db);
  return true;
}

export async function findShipmentById(id: string): Promise<DbShipment | undefined> {
  const db = await readDb();
  return db.shipments.find((s) => s.id === id);
}

export async function updateShipmentById(id: string, patch: Partial<DbShipment>): Promise<boolean> {
  const db = await readDb();
  const i = db.shipments.findIndex((s) => s.id === id);
  if (i < 0) return false;
  db.shipments[i] = { ...db.shipments[i], ...patch };
  await writeDb(db);
  return true;
}
