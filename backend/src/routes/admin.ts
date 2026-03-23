import { Router } from "express";

import { getMasterAddress, getMasterBalanceNanos } from "../services/masterWallet.js";

const router = Router();

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

export default router;
