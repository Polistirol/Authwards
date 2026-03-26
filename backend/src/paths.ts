import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Directory of the backend package (parent of `src/`), e.g. `.../backend`.
 * This is always correct whether you run from a monorepo or a Railway deploy that only contains `backend/`.
 */
export const PACKAGE_ROOT = path.resolve(__dirname, "..");

/**
 * Monorepo root (parent of `backend/`). On deploys that only upload `backend/`, this may point outside the deployed tree — do not use for DB paths without checks.
 */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

function resolveDbInitPath(): string {
  const besidePackage = path.join(PACKAGE_ROOT, "db_init.json");
  const atMonorepoRoot = path.join(REPO_ROOT, "db_init.json");
  if (fs.existsSync(besidePackage)) return besidePackage;
  if (fs.existsSync(atMonorepoRoot)) return atMonorepoRoot;
  return besidePackage;
}

/** Committed template (`users`/`agents`/`agentLogs` empty). Prefer `backend/db_init.json` on minimal deploys. */
export const DB_INIT_PATH = resolveDbInitPath();

/** Writable DB. Override with `DB_PATH` on Railway (e.g. volume mount). Default: `backend/db.json`. */
export const DB_PATH = process.env.DB_PATH?.trim()
  ? path.resolve(process.env.DB_PATH)
  : path.join(PACKAGE_ROOT, "db.json");

function resolveEnvPath(): string {
  if (process.env.ENV_PATH?.trim()) return path.resolve(process.env.ENV_PATH);
  const atMonorepo = path.join(REPO_ROOT, ".env");
  const atPackage = path.join(PACKAGE_ROOT, ".env");
  if (fs.existsSync(atMonorepo)) return atMonorepo;
  if (fs.existsSync(atPackage)) return atPackage;
  return atMonorepo;
}

export const ENV_PATH = resolveEnvPath();
