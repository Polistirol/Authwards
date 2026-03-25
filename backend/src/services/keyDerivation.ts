import crypto from "node:crypto";

import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";

function getPlatformSecret(): string {
  const s = process.env.PLATFORM_DERIVATION_SECRET?.trim();
  if (!s) throw new Error("PLATFORM_DERIVATION_SECRET not set in .env");
  return s;
}

/**
 * Deterministically derives the agent Ed25519 keypair (HKDF-SHA256 → 32-byte IOTA seed).
 * Same inputs ⇒ same key (nothing persisted on disk).
 */
export function deriveAgentKeypair(
  ownerProviderId: string,
  ownerWalletAddress: string,
  agentIndex: number,
): { keypair: Ed25519Keypair; walletAddress: string; seed: Uint8Array } {
  const ikm = Buffer.from(getPlatformSecret(), "utf8");
  const salt = Buffer.from(`${ownerProviderId}${ownerWalletAddress}`, "utf8");
  const info = Buffer.from(`agent-keypair-v1-${agentIndex}`, "utf8");
  const seed = new Uint8Array(crypto.hkdfSync("sha256", ikm, salt, info, 32));
  const keypair = Ed25519Keypair.fromSecretKey(seed);
  const walletAddress = keypair.getPublicKey().toIotaAddress();
  return { keypair, walletAddress, seed };
}
