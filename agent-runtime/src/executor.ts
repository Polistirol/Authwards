import type { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";

import * as db from "./services/db.js";
import type { DbAgent } from "./types/db.js";

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

/**
 * Invia una piccola quantità di token a `recipient` (es. treasury o owner).
 * `privateKeySeed` = 32 byte Ed25519 (stesso formato del backend).
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

/**
 * Pagamento al supplier: importo da `shipments[].paymentAmount` (nano), poi `status` → `payment_released`.
 */
export async function executeShipmentRelease(
  agent: DbAgent,
  privateKeySeed: Uint8Array,
  iotaClient: IotaClient,
  recipientAddress: string,
): Promise<{ txHash: string; shipmentId: string; amount: number }> {
  if (agent.taskType !== "shipment_monitor" || agent.taskConfig?.action !== "release_payment") {
    throw new Error("executeShipmentRelease: atteso shipment_monitor + release_payment");
  }
  const shipmentId = agent.taskConfig.shipmentId;
  const shipment = await db.getShipment(shipmentId);
  if (!shipment) throw new Error(`Spedizione non trovata: ${shipmentId}`);

  const amount = shipment.paymentAmount;
  const amountNano = BigInt(Math.max(1, Math.round(amount)));

  const signer = Ed25519Keypair.fromSecretKey(privateKeySeed);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountNano]);
  tx.transferObjects([coin], recipientAddress);
  const res = await iotaClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: TX_OPTS,
  });

  await db.updateShipmentStatus(shipmentId, "payment_released");

  return { txHash: res.digest, shipmentId, amount };
}
