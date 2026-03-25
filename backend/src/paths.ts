import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (parent of `backend/`). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const DB_PATH = path.join(REPO_ROOT, "db.json");

/** Committed template in repo (demo shipments, empty schema elsewhere). Used at boot when `db.json` is missing. */
export const DB_INIT_PATH = path.join(REPO_ROOT, "db_init.json");

export const ENV_PATH = path.join(REPO_ROOT, ".env");
