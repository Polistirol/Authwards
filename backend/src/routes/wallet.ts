import { Router } from "express";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";

import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { decryptUserWalletSecret } from "../services/agentCrypto.js";

const router = Router();

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL not set");
  return url;
}

/** IOTA balance (nanos) for an address; public. */
router.get("/balance/:address", async (req, res) => {
  try {
    const address = decodeURIComponent(req.params.address);
    const client = new IotaClient({ url: getNodeUrl() });
    const { totalBalance, coinType } = await client.getBalance({ owner: address });
    const nanos = totalBalance;
    res.json({
      address,
      coinType,
      balance: totalBalance,
      nanos,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Balance read error";
    res.status(502).json({ error: msg });
  }
});

/**
 * Transfers IOTA from the user's address (encrypted keypair in DB) to `to`.
 * Body: { to: string, amount: number } — `amount` in **nanos** (smallest unit).
 */
router.post("/transfer", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const to = req.body?.to;
    const amountRaw = req.body?.amount;
    if (typeof to !== "string" || !to.trim()) {
      res.status(400).json({ error: "Body requires { to: string, amount: number }" });
      return;
    }
    const amountNum =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
          ? parseInt(amountRaw, 10)
          : NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: "amount must be a positive integer (nanos)" });
      return;
    }
    const amountNanos = BigInt(Math.floor(amountNum));

    const user = await db.findUserByProvider(jwtUser.providerId, jwtUser.providerType);
    if (!user?.encryptedPrivateKey || !user.iv || !user.salt) {
      res.status(400).json({ error: "User wallet unavailable (complete login first or data missing)" });
      return;
    }

    const seed = decryptUserWalletSecret(user);
    const signer = Ed25519Keypair.fromSecretKey(seed);
    const from = signer.getPublicKey().toIotaAddress();

    const client = new IotaClient({ url: getNodeUrl() });
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [amountNanos]);
    tx.transferObjects([coin], to.trim());

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: TX_OPTS,
    });

    res.json({
      txHash: result.digest,
      from,
      to: to.trim(),
      amount: amountNum,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transfer error";
    res.status(500).json({ error: msg });
  }
});

export default router;
