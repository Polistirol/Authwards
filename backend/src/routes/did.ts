import { Router } from "express";

import { resolveDid } from "../services/did.js";

const router = Router();

router.get("/resolve/:did", async (req, res) => {
  try {
    const did = decodeURIComponent(req.params.did);
    if (!did.startsWith("did:")) {
      res.status(400).json({ error: "DID non valido" });
      return;
    }
    const doc = await resolveDid(did);
    res.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Risoluzione DID fallita";
    res.status(502).json({ error: msg });
  }
});

export default router;
