/**
 * Native sponsored transactions (IOTA TS SDK): sender pays intent, master pays gas.
 * Used for Move `Transaction` flows (AgentPermit, bridge transfers) and for DID creation
 * after `CreateIdentity.buildProgrammableTransaction` + `Transaction.fromKind` (see did.ts).
 *
 * `masterSponsorFn` is kept for optional identity-wasm experiments; production DID flow uses this module's
 * `sponsoredExecute` so both signatures use the same `@iota/iota-sdk` signing path as the RPC expects.
 */
import type { CoinStruct, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { IotaClient } from "@iota/iota-sdk/client";
import { bcs } from "@iota/iota-sdk/bcs";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction, TransactionDataBuilder } from "@iota/iota-sdk/transactions";
import type { SponsorFn } from "@iota/iota-interaction-ts/node/transaction_internal.js";

import { getMasterAddress, getMasterGasCoins, getMasterKeypair } from "./masterWallet.js";

/**
 * identity-wasm `buildProgrammableTransaction` returns BCS for the **inner** `ProgrammableTransaction` only.
 * `Transaction.fromKind` expects a full `TransactionKind` enum (variant + payload). Wrap when needed.
 */
export function wrapIdentityPtbForFromKind(ptbBytes: Uint8Array): Uint8Array {
  try {
    const asKind = bcs.TransactionKind.parse(ptbBytes);
    if (asKind.ProgrammableTransaction) {
      return ptbBytes;
    }
  } catch {
    /* not valid TransactionKind — treat as raw ProgrammableTransaction */
  }
  const programmable = bcs.ProgrammableTransaction.parse(ptbBytes);
  return new Uint8Array(
    bcs.TransactionKind.serialize({ ProgrammableTransaction: programmable }).toBytes(),
  );
}

const DEFAULT_OPTS = {
  showEffects: true,
  showObjectChanges: true,
  showEvents: true,
  showBalanceChanges: true,
} as const;

/** Sponsor signature for identity-wasm TransactionBuilder.withSponsor (master pays gas). */
export function masterSponsorFn(): SponsorFn {
  return async (txData: TransactionDataBuilder) => {
    const masterKp = getMasterKeypair();
    const bytes = txData.build();
    const { signature } = await masterKp.signTransaction(bytes);
    return signature;
  };
}

function gasPaymentRefsFromCoin(c: CoinStruct): { objectId: string; version: string; digest: string } {
  return {
    objectId: c.coinObjectId,
    version: String(c.version),
    digest: c.digest,
  };
}

/** Prefer the largest coin for gas (concurrent txs may lock coins; see logs). */
export function selectGasPayment(coins: CoinStruct[]): { objectId: string; version: string; digest: string }[] {
  if (!coins.length) throw new Error("Master wallet has no gas coins");
  const sorted = [...coins].sort((a, b) => {
    const ba = BigInt(a.balance);
    const bb = BigInt(b.balance);
    if (bb > ba) return 1;
    if (bb < ba) return -1;
    return 0;
  });
  return [gasPaymentRefsFromCoin(sorted[0])];
}

/** Pick one IOTA coin owned by `owner` with balance >= `minNanos` (prefer largest). */
export async function pickCoinObjectIdForPayment(
  client: IotaClient,
  owner: string,
  minNanos: bigint,
): Promise<string> {
  const { data } = await client.getCoins({ owner, limit: 50 });
  const sorted = [...data].sort((a, b) => {
    const ba = BigInt(a.balance);
    const bb = BigInt(b.balance);
    if (bb > ba) return 1;
    if (bb < ba) return -1;
    return 0;
  });
  const ok = sorted.find((c) => BigInt(c.balance) >= minNanos);
  if (!ok) {
    throw new Error(`No coin with balance >= ${minNanos} nanos for owner ${owner}`);
  }
  return ok.coinObjectId;
}

/**
 * Executes a programmable transaction with sender = `senderKeypair` and gas paid by the master wallet.
 * Builds kind-only from `tx`, wraps with {@link Transaction.fromKind}, sets sender/gas, dual-signs, executes.
 */
export async function sponsoredExecute(
  tx: Transaction,
  senderKeypair: Ed25519Keypair,
  client: IotaClient,
  options?: { gasBudget?: bigint },
): Promise<IotaTransactionBlockResponse> {
  const sponsorKp = getMasterKeypair();
  const sponsorAddr = getMasterAddress();
  const senderAddr = senderKeypair.getPublicKey().toIotaAddress();
  const gasBudget = options?.gasBudget ?? 50_000_000n;

  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  const sponsored = Transaction.fromKind(kindBytes);
  sponsored.setSender(senderAddr);
  sponsored.setGasOwner(sponsorAddr);

  const gasCoins = await getMasterGasCoins(client);
  const gasPrice = await client.getReferenceGasPrice();
  sponsored.setGasPrice(gasPrice);
  sponsored.setGasBudget(gasBudget);
  sponsored.setGasPayment(selectGasPayment(gasCoins));

  const txBytes = await sponsored.build({ client });

  const senderSig = await senderKeypair.signTransaction(txBytes);
  const sponsorSig = await sponsorKp.signTransaction(txBytes);

  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [senderSig.signature, sponsorSig.signature],
    options: DEFAULT_OPTS,
  });

  const st = result.effects?.status?.status;
  if (st !== "success") {
    const err = result.effects?.status?.error ?? "unknown";
    console.error(
      `[sponsoredTx] Sponsored tx failed: ${err} sender=${senderAddr} sponsor=${sponsorAddr}`,
    );
    throw new Error(typeof err === "string" ? err : "Sponsored transaction failed");
  }

  console.log(
    `[sponsoredTx] Sponsored tx: sender=${senderAddr}, sponsor=${sponsorAddr}, digest=${result.digest}`,
  );
  return result;
}
