import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 210_000;

export function encryptAgentPrivateKey(agentDid: string, secretSeed: Uint8Array): {
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
} {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET non configurato");
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(
    `${jwtSecret}${agentDid}`,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(secretSeed)), cipher.final(), cipher.getAuthTag()]);
  return {
    encryptedPrivateKey: enc.toString("base64"),
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
  };
}
