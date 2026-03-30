import { Router } from "express";

import {
  DidNotResolvableError,
  resolveDelegate,
  resolveOwnerDelegates,
  resolveTransaction,
} from "../services/trustChain.js";

const router = Router();

router.get("/delegate/:did", async (req, res) => {
  try {
    const did = decodeURIComponent(req.params.did ?? "");
    const result = await resolveDelegate(did);
    res.json(result);
  } catch (e) {
    if (e instanceof DidNotResolvableError) {
      res.status(404).json({
        error: "did_not_found",
        message: e.message,
      });
      return;
    }
    const msg = e instanceof Error ? e.message : "Resolution failed";
    res.status(500).json({ error: msg });
  }
});

router.get("/owner/:did/delegates", async (req, res) => {
  try {
    const ownerDid = decodeURIComponent(req.params.did ?? "");
    const result = await resolveOwnerDelegates(ownerDid);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resolution failed";
    res.status(500).json({ error: msg });
  }
});

router.get("/tx/:txHash", async (req, res) => {
  try {
    const txHash = decodeURIComponent(req.params.txHash ?? "");
    const result = await resolveTransaction(txHash);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resolution failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
