import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (parent of `backend/`). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const DB_PATH = path.join(REPO_ROOT, "db.json");

/** Template committato in repo (shipments demo, schema vuoto altrove). Usato a boot se `db.json` non esiste. */
export const DB_INIT_PATH = path.join(REPO_ROOT, "db_init.json");

export const ENV_PATH = path.join(REPO_ROOT, ".env");
