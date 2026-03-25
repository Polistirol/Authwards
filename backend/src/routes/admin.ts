import { Router, type Request } from "express";

import { mergeDbInitIntoExisting } from "../services/db.js";
import { getMasterAddress, getMasterBalanceNanos } from "../services/masterWallet.js";

const router = Router();

function mergeDbInitAuthOk(req: Request): boolean {
  const secret = process.env.MERGE_DB_INIT_SECRET?.trim();
  if (!secret) return true;
  const header = (req.headers["x-merge-db-init-secret"] as string | undefined)?.trim();
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  return header === secret || bearer === secret;
}

/** Debug: stato master wallet e airdrop (nessun JWT). */
router.get("/master-status", async (_req, res) => {
  try {
    const nanos = await getMasterBalanceNanos();
    res.json({
      address: getMasterAddress(),
      balance: nanos.toString(),
      balanceIota: Number(nanos) / 1e9,
      airdropEnabled: process.env.WELCOME_AIRDROP_ENABLED?.toLowerCase() === "true",
      airdropAmount: process.env.WELCOME_AIRDROP_AMOUNT ?? "0",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    res.status(500).json({ error: msg });
  }
});

/**
 * Unisce `db_init.json` nel `db.json` esistente: aggiunge solo shipments con `id` nuovi.
 * Opzionale: `MERGE_DB_INIT_SECRET` — allora header `X-Merge-DB-Init-Secret` o `Authorization: Bearer <secret>`.
 */
router.post("/merge-db-init", async (req, res) => {
  try {
    if (!mergeDbInitAuthOk(req)) {
      res.status(401).json({ error: "Non autorizzato" });
      return;
    }
    const r = await mergeDbInitIntoExisting();
    res.json({
      ok: true,
      addedShipments: r.addedShipments,
      changed: r.changed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    res.status(500).json({ error: msg });
  }
});

export default router;
