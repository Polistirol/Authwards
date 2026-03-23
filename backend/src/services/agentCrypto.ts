import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 210_000;

function deriveKey(scopeId: string, salt: Buffer): Buffer {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET non configurato");
  return crypto.pbkdf2Sync(`${jwtSecret}${scopeId}`, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

/** Cifratura AES-256-GCM; `scopeId` = `googleId` (utenti) o DID agente (agenti), pepper PBKDF2 con JWT_SECRET. */
export function encryptAgentPrivateKey(scopeId: string, secretSeed: Uint8Array): {
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
} {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(scopeId, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(secretSeed)), cipher.final(), cipher.getAuthTag()]);
  return {
    encryptedPrivateKey: enc.toString("base64"),
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/** Decripta il seed del wallet utente (PBKDF2 con `googleId`; fallback su `did` per record legacy). */
export function decryptUserWalletSecret(user: {
  googleId: string;
  did: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
}): Uint8Array {
  if (!user.encryptedPrivateKey || !user.iv || !user.salt) {
    throw new Error("Dati cifratura wallet mancanti");
  }
  try {
    return decryptPrivateKey(user.googleId, user.encryptedPrivateKey, user.iv, user.salt);
  } catch {
    return decryptPrivateKey(user.did, user.encryptedPrivateKey, user.iv, user.salt);
  }
}

export function decryptPrivateKey(
  scopeId: string,
  encryptedPrivateKeyB64: string,
  ivB64: string,
  saltB64: string,
): Uint8Array {
  const key = deriveKey(scopeId, Buffer.from(saltB64, "base64"));
  const iv = Buffer.from(ivB64, "base64");
  const combined = Buffer.from(encryptedPrivateKeyB64, "base64");
  const authTagLen = 16;
  if (combined.length < authTagLen) throw new Error("Payload cifrato non valido");
  const ciphertext = combined.subarray(0, combined.length - authTagLen);
  const authTag = combined.subarray(combined.length - authTagLen);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}
