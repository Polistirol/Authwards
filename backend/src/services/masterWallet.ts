import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";

let masterKeypair: Ed25519Keypair | null = null;

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL non impostata");
  return url;
}

function parseHexSecret(hex: string): Uint8Array {
  const s = hex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length !== 64) {
    throw new Error("MASTER_WALLET_PRIVATE_KEY deve essere 32 byte in hex (64 caratteri, opzionale prefisso 0x)");
  }
  return new Uint8Array(Buffer.from(s, "hex"));
}

/** Carica e memorizza la keypair del master (mnemonic o chiave hex/bech32). Chiamare una volta all’avvio. */
export function initMasterWallet(): void {
  const pk = process.env.MASTER_WALLET_PRIVATE_KEY?.trim();
  const mnemonic =
    process.env.MASTER_WALLET_SEED_PHRASE?.trim() ||
    process.env.MASTER_WALLET_MNEMONIC?.trim();

  if (pk) {
    try {
      if (/^iotaprivkey/i.test(pk) || pk.length > 90) {
        masterKeypair = Ed25519Keypair.fromSecretKey(pk);
      } else {
        masterKeypair = Ed25519Keypair.fromSecretKey(parseHexSecret(pk));
      }
    } catch {
      masterKeypair = Ed25519Keypair.fromSecretKey(pk);
    }
  } else if (mnemonic) {
    masterKeypair = Ed25519Keypair.deriveKeypair(mnemonic);
  } else {
    throw new Error(
      "Configura MASTER_WALLET_PRIVATE_KEY (hex 32 byte) oppure MASTER_WALLET_SEED_PHRASE / MASTER_WALLET_MNEMONIC",
    );
  }

  const derived = getMasterAddress();
  const envAddr = process.env.MASTER_WALLET_ADDRESS?.trim();
  if (envAddr && envAddr.toLowerCase() !== derived.toLowerCase()) {
    console.warn(
      `[masterWallet] MASTER_WALLET_ADDRESS (${envAddr}) non coincide con l'indirizzo derivato dalla chiave (${derived}). Verifica il .env.`,
    );
  }
}

export function getMasterKeypair(): Ed25519Keypair {
  if (!masterKeypair) throw new Error("Master wallet non inizializzato (initMasterWallet)");
  return masterKeypair;
}

export function getMasterAddress(): string {
  return getMasterKeypair().getPublicKey().toIotaAddress();
}

export async function getMasterBalanceNanos(): Promise<bigint> {
  const client = new IotaClient({ url: getNodeUrl() });
  const { totalBalance } = await client.getBalance({ owner: getMasterAddress() });
  return BigInt(totalBalance);
}

const TX_OPTS = {
  showEffects: true,
  showBalanceChanges: true,
} as const;

/** Trasferimento di `amountNanos` dal wallet master verso `toAddress`. Ritorna il digest della tx. */
export async function transferFromMaster(toAddress: string, amountNanos: bigint): Promise<string> {
  const signer = getMasterKeypair();
  const client = new IotaClient({ url: getNodeUrl() });
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountNanos]);
  tx.transferObjects([coin], toAddress);
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: TX_OPTS,
  });
  return result.digest;
}

export async function logMasterWalletStatus(): Promise<void> {
  try {
    const addr = getMasterAddress();
    const nanos = await getMasterBalanceNanos();
    const iota = Number(nanos) / 1e9;
    console.log(`[masterWallet] Master wallet loaded: ${addr} (balance: ${iota.toFixed(4)} IOTA / ${nanos} nanos)`);
  } catch (e) {
    console.warn("[masterWallet] Impossibile leggere il saldo master:", e);
  }
}
