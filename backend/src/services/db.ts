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
    throw new Error("Invalid user record");
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
    throw new Error("User record missing providerId");
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
    throw new Error("Invalid agent record");
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
    throw new Error("Agent record missing ownerProviderId");
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
    console.error("[db] Failed to read db_init.json:", e);
    return null;
  }
}

/** Appends shipments from `init` that are not already present (key `id`). Does not touch users/agents/agentLogs. */
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
 * Reads `db_init.json` and merges into the on-disk DB only new shipments (by `id`).
 * Useful after a deploy with new demo records without losing local users/agents.
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

/**
 * Sovrascrive `db.json` con il contenuto normalizzato di `db_init.json`.
 * Se `db_init.json` manca o non è leggibile, scrive un DB vuoto.
 * Perdita totale di utenti/agenti/log locali — solo per test o reset controllato.
 */
export async function resetDbFromInit(): Promise<{ source: "init" | "empty" }> {
  const init = await readDbInitFromDisk();
  if (init) {
    await writeDb(init);
    return { source: "init" };
  }
  await writeDb(emptyDb());
  return { source: "empty" };
}

export async function ensureDbFile(): Promise<void> {
  const exists = await fs.pathExists(DB_PATH);
  if (!exists) {
    const init = await readDbInitFromDisk();
    if (init) {
      await fs.writeFile(DB_PATH, JSON.stringify(init, null, 2), "utf8");
      console.log(
        `[db] No db.json — created from db_init.json (${init.shipments.length} shipment(s), ${init.users.length} user(s)).`,
      );
    } else {
      console.warn(
        "[db] No db.json and db_init.json missing or unreadable — created empty db.json (no demo shipments).",
      );
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
    console.error("[db] db.json corrupt — replacing with empty db.json");
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

/**
 * Sostituisce interamente `db.json` dopo normalizzazione/migrazione record.
 * Può lanciare se un user/agent non è migrabile (es. manca providerId).
 */
export async function replaceDbFromPayload(parsed: unknown): Promise<DbShape> {
  const { shape } = normalizeDb(parsed);
  await writeDb(shape);
  return shape;
}

export async function findUserByProvider(
  providerId: string,
  providerType: AuthProviderType,
): Promise<DbUser | undefined> {
  const db = await readDb();
  return db.users.find((u) => u.providerId === providerId && u.providerType === providerType);
}

/** @deprecated Use findUserByProvider; legacy read compatibility only. */
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

/** @deprecated Use updateUserByProvider. */
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
