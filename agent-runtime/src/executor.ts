import type { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";

import type { DbAgent } from "./types/db.js";

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

/**
 * Sends a small amount to `recipient`.
 * `privateKeySeed` = 32-byte Ed25519 (same format as backend).
 */
export async function execute(
  agent: DbAgent,
  privateKeySeed: Uint8Array,
  iotaClient: IotaClient,
  recipientAddress: string,
  amountNano: bigint,
): Promise<{ success: boolean; txHash: string }> {
  void agent;
  const signer = Ed25519Keypair.fromSecretKey(privateKeySeed);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountNano]);
  tx.transferObjects([coin], recipientAddress);
  const res = await iotaClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: TX_OPTS,
  });
  return { success: true, txHash: res.digest };
}
