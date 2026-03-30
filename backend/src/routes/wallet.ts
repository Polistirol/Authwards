import { Router } from "express";
import type { BalanceChange, IotaTransactionBlockResponse, ObjectOwner } from "@iota/iota-sdk/client";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import { normalizeIotaAddress } from "@iota/iota-sdk/utils";

import { iotaToNanos, nanosToIota } from "../constants.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import * as db from "../services/db.js";
import { decryptUserWalletSecret } from "../services/agentCrypto.js";
import { deriveAgentKeypair } from "../services/keyDerivation.js";
import { appendTransferFromOwnerIotaCoins, sponsoredExecute } from "../services/sponsoredTx.js";

const router = Router();

/** Same as bridge `/transact`: gas sponsored by master; agent pays transfer from coin balance. */
const WITHDRAW_AGENT_GAS_BUDGET = 50_000_000n;

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL not set");
  return url;
}

/** IOTA balance for an address; public. Amounts: `balanceNanos` / `balance` are chain nanos; `balanceIota` is display. */
router.get("/balance/:address", async (req, res) => {
  try {
    const address = decodeURIComponent(req.params.address);
    const client = new IotaClient({ url: getNodeUrl() });
    const { totalBalance, coinType } = await client.getBalance({ owner: address });
    const nanosBi = BigInt(totalBalance);
    res.json({
      address,
      coinType,
      balanceNanos: totalBalance,
      balanceIota: nanosToIota(nanosBi),
      balance: totalBalance,
      nanos: totalBalance,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Balance read error";
    res.status(502).json({ error: msg });
  }
});

/**
 * Transfers IOTA from the user's address (encrypted keypair in DB) to `to`.
 * Body: { to: string, amount: number, unit?: "nanos" | "iota" } — default **nanos**; use `unit: "iota"` for whole/fractional IOTA.
 */
router.post("/transfer", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const to = req.body?.to;
    const amountRaw = req.body?.amount;
    const unitRaw = req.body?.unit;
    const unit = unitRaw === "iota" ? "iota" : "nanos";
    if (typeof to !== "string" || !to.trim()) {
      res.status(400).json({ error: "Body requires { to: string, amount: number }" });
      return;
    }
    const amountNum =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
          ? unit === "iota"
            ? Number.parseFloat(amountRaw)
            : parseInt(amountRaw, 10)
          : NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: "amount must be a positive number (nanos, or IOTA if unit is iota)" });
      return;
    }
    const amountNanos = unit === "iota" ? iotaToNanos(amountNum) : BigInt(Math.floor(amountNum));

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
      amountNanos: amountNanos.toString(),
      amountIota: nanosToIota(amountNanos),
      amount: Number(amountNanos),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transfer error";
    res.status(500).json({ error: msg });
  }
});

/**
 * Transfers IOTA from a delegate (agent) wallet to the logged-in user's wallet.
 * Owner-only; does not consume agent permit / daily budget (recovery to owner).
 * Body: { agentDid: string, amount: number, unit?: "nanos" | "iota" }
 */
router.post("/withdraw-from-agent", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const agentDidRaw = req.body?.agentDid;
    const amountRaw = req.body?.amount;
    const unitRaw = req.body?.unit;
    const unit = unitRaw === "iota" ? "iota" : "nanos";

    if (typeof agentDidRaw !== "string" || !agentDidRaw.trim()) {
      res.status(400).json({ error: "Body requires { agentDid: string, amount: number }" });
      return;
    }
    const agentDid = agentDidRaw.trim();

    const a = await db.findAgentByDid(agentDid);
    if (
      !a ||
      a.ownerProviderId !== jwtUser.providerId ||
      a.ownerProviderType !== jwtUser.providerType
    ) {
      res.status(403).json({ error: "Agent not found or not authorized" });
      return;
    }

    if (typeof a.agentIndex !== "number") {
      res.status(400).json({
        error: "legacy_agent",
        message: "This delegate was created with an older format; create a new delegate to move funds.",
      });
      return;
    }

    const owner = await db.findUserByProvider(jwtUser.providerId, jwtUser.providerType);
    if (!owner?.walletAddress) {
      res.status(400).json({ error: "User wallet unavailable" });
      return;
    }

    const amountNum =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
          ? unit === "iota"
            ? Number.parseFloat(amountRaw)
            : parseInt(amountRaw, 10)
          : NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    const amountNanos = unit === "iota" ? iotaToNanos(amountNum) : BigInt(Math.floor(amountNum));
    if (amountNanos <= 0n) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const { keypair } = deriveAgentKeypair(a.ownerProviderId, owner.walletAddress, a.agentIndex);
    const from = keypair.getPublicKey().toIotaAddress();
    if (a.walletAddress && from.trim().toLowerCase() !== a.walletAddress.trim().toLowerCase()) {
      res.status(500).json({ error: "Agent wallet mismatch; contact support" });
      return;
    }

    let to: string;
    try {
      to = normalizeIotaAddress(owner.walletAddress.trim(), false, true);
    } catch {
      res.status(400).json({ error: "Invalid user wallet address" });
      return;
    }

    const client = new IotaClient({ url: getNodeUrl() });
    const { totalBalance } = await client.getBalance({ owner: from });
    const balanceNanos = BigInt(totalBalance);
    if (balanceNanos < amountNanos) {
      res.status(400).json({
        error: "insufficient_balance",
        message: "Insufficient balance on delegate wallet",
        walletBalanceNanos: balanceNanos.toString(),
        walletBalanceIota: nanosToIota(balanceNanos),
      });
      return;
    }

    const tx = new Transaction();
    await appendTransferFromOwnerIotaCoins(tx, client, from, amountNanos, to);

    const result = await sponsoredExecute(tx, keypair, client, { gasBudget: WITHDRAW_AGENT_GAS_BUDGET });

    await db.addAgentLog({
      agentDid: a.agentDid,
      createdAt: new Date().toISOString(),
      message: "owner_withdraw",
      meta: {
        txHash: result.digest,
        amountNanos: amountNanos.toString(),
        to,
      },
    });

    res.json({
      txHash: result.digest,
      from,
      to,
      amountNanos: amountNanos.toString(),
      amountIota: nanosToIota(amountNanos),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Withdraw error";
    res.status(500).json({ error: msg });
  }
});

function normAddr(a: string): string {
  return a.trim().toLowerCase();
}

function ownerToAddress(owner: ObjectOwner): string | null {
  if (owner && typeof owner === "object" && "AddressOwner" in owner) {
    return (owner as { AddressOwner: string }).AddressOwner;
  }
  return null;
}

function isNativeIotaCoin(coinType: string): boolean {
  return /::iota::IOTA$/i.test(coinType);
}

function sumMyIotaDelta(changes: BalanceChange[] | null | undefined, addrNorm: string): bigint {
  if (!changes?.length) return 0n;
  let sum = 0n;
  for (const c of changes) {
    if (!isNativeIotaCoin(c.coinType)) continue;
    const oa = ownerToAddress(c.owner);
    if (!oa || normAddr(oa) !== addrNorm) continue;
    sum += BigInt(c.amount);
  }
  return sum;
}

function counterpartyFromTx(
  tx: IotaTransactionBlockResponse,
  addrNorm: string,
  myDelta: bigint,
  changes: BalanceChange[] | null | undefined,
): string {
  const list = changes ?? [];
  const sender = tx.transaction?.data?.sender;

  if (myDelta > 0n) {
    if (sender && normAddr(sender) !== addrNorm) return sender;
    for (const c of list) {
      if (!isNativeIotaCoin(c.coinType)) continue;
      const oa = ownerToAddress(c.owner);
      if (!oa || normAddr(oa) === addrNorm) continue;
      if (BigInt(c.amount) < 0n) return oa;
    }
    return sender ?? "—";
  }
  if (myDelta < 0n) {
    for (const c of list) {
      if (!isNativeIotaCoin(c.coinType)) continue;
      const oa = ownerToAddress(c.owner);
      if (!oa || normAddr(oa) === addrNorm) continue;
      if (BigInt(c.amount) > 0n) return oa;
    }
    return sender ?? "—";
  }
  return sender ?? "—";
}

/** Recent IOTA transfers involving `address` (public). */
router.get("/transactions/:address", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.address);
    let normalized: string;
    try {
      /** `forceAdd0x: false` — addresses from URLs already include `0x`; `true` corrupts padding. */
      normalized = normalizeIotaAddress(raw.trim(), false, true);
    } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }
    const limitRaw = req.query.limit;
    const limit = Math.min(
      50,
      Math.max(1, typeof limitRaw === "string" ? parseInt(limitRaw, 10) || 20 : 20),
    );

    const client = new IotaClient({ url: getNodeUrl() });
    const page = await client.queryTransactionBlocks({
      filter: { FromOrToAddress: { addr: normalized } },
      limit,
      order: "descending",
      options: {
        showBalanceChanges: true,
        showInput: true,
        showEffects: true,
      },
    });

    const addrNorm = normAddr(normalized);
    const data = page.data ?? [];
    const transactions: {
      txHash: string;
      type: "sent" | "received";
      amount: string;
      amountIota: number;
      counterparty: string;
      timestamp: string;
    }[] = [];

    for (const tx of data) {
      const delta = sumMyIotaDelta(tx.balanceChanges, addrNorm);
      if (delta === 0n) continue;

      const abs = delta < 0n ? -delta : delta;
      const type: "sent" | "received" = delta < 0n ? "sent" : "received";
      const counterparty = counterpartyFromTx(tx, addrNorm, delta, tx.balanceChanges);

      const tsMs = tx.timestampMs ? Number(tx.timestampMs) : NaN;
      const timestamp = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : new Date().toISOString();

      transactions.push({
        txHash: tx.digest,
        type,
        amount: abs.toString(),
        amountIota: nanosToIota(abs),
        counterparty,
        timestamp,
      });
    }

    res.json({ transactions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction query error";
    res.status(502).json({ error: msg });
  }
});

export default router;
