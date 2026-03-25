import { Router } from "express";

import { requireJwt } from "../middleware/auth.js";
import * as db from "../services/db.js";

const router = Router();

router.get("/", requireJwt, async (_req, res) => {
  try {
    const data = await db.readDb();
    res.json(data.shipments);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

router.get("/:id", requireJwt, async (req, res) => {
  try {
    const s = await db.findShipmentById(req.params.id);
    if (!s) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(s);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

router.patch("/:id", requireJwt, async (req, res) => {
  try {
    const status = req.body?.status;
    if (typeof status !== "string" || !status.trim()) {
      res.status(400).json({ error: "Body requires { status: string }" });
      return;
    }
    const ok = await db.updateShipmentById(req.params.id, { status: status.trim() });
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const s = await db.findShipmentById(req.params.id);
    res.json(s);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.status(500).json({ error: msg });
  }
});

export default router;
