import fs from "fs-extra";

import type { AuthProviderType, DbAgent, DbAgentLog, DbShape, DbUser } from "../types/db.js";
import { DB_INIT_PATH, DB_PATH } from "../paths.js";

const emptyDb = (): DbShape => ({
  users: [],
  agents: [],
  agentLogs: [],
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
  if ("shipments" in o && o.shipments !== undefined) {
    migrated = true;
  }
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
    },
    migrated,
  };
}

function needsDbRepair(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return true;
  const o = parsed as Record<string, unknown>;
  return !Array.isArray(o.users) || !Array.isArray(o.agents) || !Array.isArray(o.agentLogs);
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

/** Legacy no-op: kept for admin `POST /merge-db-init` compatibility. */
export async function mergeDbInitIntoExisting(): Promise<{ addedShipments: number; changed: boolean }> {
  return { addedShipments: 0, changed: false };
}

/**
 * Overwrites `db.json` from normalized `db_init.json`, or empty DB if init is missing.
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
        `[db] No db.json — created from db_init.json (${init.users.length} user(s) in template).`,
      );
    } else {
      console.warn("[db] No db.json and db_init.json missing or unreadable — created empty db.json.");
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
 * Replaces entire `db.json` after record normalization/migration.
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

/** Agents whose `ownerDid` matches (public trust-chain resolution). */
export async function findAgentsByOwnerDid(ownerDid: string): Promise<DbAgent[]> {
  const db = await readDb();
  return db.agents.filter((a) => a.ownerDid === ownerDid);
}

/** Find user by IOTA wallet address (normalized compare). */
export async function findUserByWalletAddress(walletAddress: string): Promise<DbUser | undefined> {
  const norm = walletAddress.trim().toLowerCase();
  const db = await readDb();
  return db.users.find((u) => u.walletAddress && u.walletAddress.trim().toLowerCase() === norm);
}

/** Find agent by wallet address (normalized compare). */
export async function findAgentByWalletAddress(walletAddress: string): Promise<DbAgent | undefined> {
  const norm = walletAddress.trim().toLowerCase();
  const db = await readDb();
  return db.agents.find((a) => a.walletAddress && a.walletAddress.trim().toLowerCase() === norm);
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

/** Removes the agent row and its logs. On-chain DID / wallet are unchanged. */
export async function deleteAgentByDid(agentDid: string): Promise<boolean> {
  const db = await readDb();
  const i = db.agents.findIndex((a) => a.agentDid === agentDid);
  if (i < 0) return false;
  db.agents.splice(i, 1);
  db.agentLogs = db.agentLogs.filter((l) => l.agentDid !== agentDid);
  await writeDb(db);
  return true;
}
