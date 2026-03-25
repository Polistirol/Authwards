import fs from "fs-extra";

import type { AuthProviderType, DbAgent, DbAgentLog, DbShape, DbShipment, DbUser } from "../types/db.js";
import { DB_INIT_PATH, DB_PATH } from "../paths.js";

const emptyDb = (): DbShape => ({
  users: [],
  agents: [],
  agentLogs: [],
  shipments: [],
});

function isAuthProviderType(v: unknown): v is AuthProviderType {
  return v === "google" || v === "github" || v === "wallet" || v === "telegram";
}

function migrateUserRecord(raw: unknown): { user: DbUser; migrated: boolean } {
  if (!raw || typeof raw !== "object") {
    throw new Error("Record utente non valido");
  }
  const o = { ...(raw as Record<string, unknown>) };
  let migrated = false;
  if (typeof o.googleId === "string" && o.googleId && typeof o.providerId !== "string") {
    o.providerId = o.googleId;
    o.providerType = "google";
    delete o.googleId;
    migrated = true;
  }
  if (typeof o.providerId !== "string" || !o.providerId) {
    throw new Error("Record utente senza providerId");
  }
  if (!isAuthProviderType(o.providerType)) {
    o.providerType = "google";
    migrated = true;
  }
  delete o.googleId;
  const email =
    o.email === undefined || o.email === null ? null : String(o.email);
  const picture =
    o.picture === undefined || o.picture === null ? null : String(o.picture);
  const name = o.name === undefined || o.name === null ? "" : String(o.name);
  return {
    user: {
      ...(o as unknown as DbUser),
      email,
      picture,
      name,
      providerId: o.providerId as string,
      providerType: o.providerType as AuthProviderType,
      nextAgentIndex: (o.nextAgentIndex as number | undefined) ?? 0,
    },
    migrated,
  };
}

function migrateAgentRecord(raw: unknown): { agent: DbAgent; migrated: boolean } {
  if (!raw || typeof raw !== "object") {
    throw new Error("Record agente non valido");
  }
  const o = { ...(raw as Record<string, unknown>) };
  let migrated = false;
  if (typeof o.ownerGoogleId === "string" && o.ownerGoogleId && typeof o.ownerProviderId !== "string") {
    o.ownerProviderId = o.ownerGoogleId;
    o.ownerProviderType = "google";
    delete o.ownerGoogleId;
    migrated = true;
  }
  if (typeof o.ownerProviderId !== "string" || !o.ownerProviderId) {
    throw new Error("Record agente senza ownerProviderId");
  }
  if (!isAuthProviderType(o.ownerProviderType)) {
    o.ownerProviderType = "google";
    migrated = true;
  }
  delete o.ownerGoogleId;
  return {
    agent: { ...(o as unknown as DbAgent) } as DbAgent,
    migrated,
  };
}

export function normalizeDb(parsed: unknown): { shape: DbShape; migrated: boolean } {
  if (!parsed || typeof parsed !== "object") {
    return { shape: emptyDb(), migrated: false };
  }
  const o = parsed as Record<string, unknown>;
  const usersRaw = Array.isArray(o.users) ? o.users : [];
  const agentsRaw = Array.isArray(o.agents) ? o.agents : [];
  let migrated = false;
  const users: DbUser[] = [];
  for (const u of usersRaw) {
    const r = migrateUserRecord(u);
    if (r.migrated) migrated = true;
    users.push(r.user);
  }
  const agents: DbAgent[] = [];
  for (const a of agentsRaw) {
    const r = migrateAgentRecord(a);
    if (r.migrated) migrated = true;
    agents.push(r.agent);
  }
  return {
    shape: {
      users,
      agents,
      agentLogs: Array.isArray(o.agentLogs) ? (o.agentLogs as DbAgentLog[]) : [],
      shipments: Array.isArray(o.shipments) ? (o.shipments as DbShipment[]) : [],
    },
    migrated,
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

async function readDbInitFromDisk(): Promise<DbShape | null> {
  const exists = await fs.pathExists(DB_INIT_PATH);
  if (!exists) return null;
  try {
    const raw = await fs.readFile(DB_INIT_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeDb(parsed).shape;
  } catch (e) {
    console.error("[db] Lettura db_init.json fallita:", e);
    return null;
  }
}

/** Aggiunge shipments da `init` che non esistono già (chiave `id`). Non tocca users/agents/agentLogs. */
export function mergeShipmentsFromInit(current: DbShape, init: DbShape): { merged: DbShape; addedCount: number } {
  const seen = new Set(current.shipments.map((s) => s.id));
  const mergedShipments = [...current.shipments];
  let addedCount = 0;
  for (const s of init.shipments) {
    if (seen.has(s.id)) continue;
    mergedShipments.push(s);
    seen.add(s.id);
    addedCount++;
  }
  return {
    merged: { ...current, shipments: mergedShipments },
    addedCount,
  };
}

/**
 * Legge `db_init.json` e unisce nel DB su disco solo shipments nuove (per `id`).
 * Utile dopo un deploy con nuovi record demo senza perdere utenti/agenti locali.
 */
export async function mergeDbInitIntoExisting(): Promise<{ addedShipments: number; changed: boolean }> {
  const init = await readDbInitFromDisk();
  if (!init) {
    return { addedShipments: 0, changed: false };
  }
  const current = await readDb();
  const { merged, addedCount } = mergeShipmentsFromInit(current, init);
  if (addedCount === 0) {
    return { addedShipments: 0, changed: false };
  }
  await writeDb(merged);
  return { addedShipments: addedCount, changed: true };
}

export async function ensureDbFile(): Promise<void> {
  const exists = await fs.pathExists(DB_PATH);
  if (!exists) {
    const init = await readDbInitFromDisk();
    if (init) {
      await fs.writeFile(DB_PATH, JSON.stringify(init, null, 2), "utf8");
    } else {
      await fs.writeJson(DB_PATH, emptyDb(), { spaces: 2 });
    }
    return;
  }
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (needsDbRepair(parsed)) {
      const { shape } = normalizeDb(parsed);
      await writeDb(shape);
    }
  } catch {
    await fs.writeJson(DB_PATH, emptyDb(), { spaces: 2 });
  }
}

export async function readDb(): Promise<DbShape> {
  const raw = await fs.readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const { shape, migrated } = normalizeDb(parsed);
  if (migrated) {
    await writeDb(shape);
  }
  return shape;
}

export async function writeDb(data: DbShape): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function findUserByProvider(
  providerId: string,
  providerType: AuthProviderType,
): Promise<DbUser | undefined> {
  const db = await readDb();
  return db.users.find((u) => u.providerId === providerId && u.providerType === providerType);
}

/** @deprecated Usare findUserByProvider; solo compat lettura codice legacy. */
export async function findUserByGoogleId(googleId: string): Promise<DbUser | undefined> {
  return findUserByProvider(googleId, "google");
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

export async function findAgentsByOwner(
  ownerProviderId: string,
  ownerProviderType: AuthProviderType,
): Promise<DbAgent[]> {
  const db = await readDb();
  return db.agents.filter(
    (a) => a.ownerProviderId === ownerProviderId && a.ownerProviderType === ownerProviderType,
  );
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

export async function updateUserByProvider(
  providerId: string,
  providerType: AuthProviderType,
  patch: Partial<DbUser>,
): Promise<boolean> {
  const db = await readDb();
  const i = db.users.findIndex((u) => u.providerId === providerId && u.providerType === providerType);
  if (i < 0) return false;
  db.users[i] = { ...db.users[i], ...patch };
  await writeDb(db);
  return true;
}

/** @deprecated Usare updateUserByProvider. */
export async function updateUserByGoogleId(googleId: string, patch: Partial<DbUser>): Promise<boolean> {
  return updateUserByProvider(googleId, "google", patch);
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
