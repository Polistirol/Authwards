import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { normalizeIotaAddress } from "@iota/iota-sdk/utils";
import { verifyPersonalMessageSignature } from "@iota/iota-sdk/verify";

import * as db from "../services/db.js";
import { createDid, createDidForWalletOwner } from "../services/did.js";
import { encryptAgentPrivateKey } from "../services/agentCrypto.js";
import { transferFromMaster } from "../services/masterWallet.js";
import { consumeWalletChallenge, setWalletChallenge } from "../services/walletChallengeStore.js";
import type { AuthProviderType, DbUser } from "../types/db.js";

const router = Router();

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET non configurato");
  return s;
}

function buildWalletLoginMessage(nonce: string): string {
  return `Sign this message to login to IOTA Auth: ${nonce}`;
}

function toPublicUser(u: DbUser) {
  const {
    encryptedPrivateKey: _enc,
    iv: _iv,
    salt: _salt,
    ...rest
  } = u;
  return rest;
}

function signUserJwt(user: DbUser): string {
  const tokenPayload: Record<string, string | boolean | undefined> = {
    providerId: user.providerId,
    providerType: user.providerType,
    did: user.did,
    email: user.email ?? "",
    name: user.name,
    walletAddress: user.walletAddress,
  };
  return jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: "24h" });
}

router.post("/wallet/challenge", async (req, res) => {
  try {
    const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
    if (!walletAddress) {
      res.status(400).json({ error: "Body richiede { walletAddress: string }" });
      return;
    }
    const nonce = crypto.randomBytes(32).toString("hex");
    const message = buildWalletLoginMessage(nonce);
    setWalletChallenge(walletAddress, nonce);
    res.json({ nonce, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore challenge";
    res.status(500).json({ error: msg });
  }
});

router.post("/wallet/verify", async (req, res) => {
  try {
    const walletAddress =
      typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
    const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
    const nonce = typeof req.body?.nonce === "string" ? req.body.nonce.trim() : "";
    if (!walletAddress || !signature || !nonce) {
      res.status(400).json({ error: "Body richiede { walletAddress, signature, nonce }" });
      return;
    }
    if (!consumeWalletChallenge(walletAddress, nonce)) {
      res.status(401).json({ error: "Nonce non valido o scaduto" });
      return;
    }
    const message = buildWalletLoginMessage(nonce);
    const messageBytes = new TextEncoder().encode(message);
    let publicKey;
    try {
      publicKey = await verifyPersonalMessageSignature(messageBytes, signature, {
        address: normalizeIotaAddress(walletAddress),
      });
    } catch {
      res.status(401).json({ error: "Firma non valida" });
      return;
    }
    const derived = normalizeIotaAddress(publicKey.toIotaAddress());
    const claimed = normalizeIotaAddress(walletAddress);
    if (derived !== claimed) {
      res.status(401).json({ error: "Indirizzo wallet non corrispondente alla firma" });
      return;
    }

    const providerType: AuthProviderType = "wallet";
    const providerId = claimed;

    let user = await db.findUserByProvider(providerId, providerType);
    if (!user) {
      const { did, didDocument, DIDCreationTx, walletAddress: wa } = await createDidForWalletOwner(publicKey);
      user = {
        providerId,
        providerType,
        email: null,
        name: `Wallet ${providerId.slice(0, 10)}…`,
        picture: null,
        did,
        didDocument,
        DIDCreationTx,
        didGasMode: "master_payer",
        walletAddress: wa,
        createdAt: new Date().toISOString(),
      };
      await db.addUser(user);
    }

    const token = signUserJwt(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore verifica wallet";
    console.error("[auth/wallet/verify]", e);
    res.status(500).json({ error: msg });
  }
});

function telegramDataCheckString(data: Record<string, string>): string {
  const keys = Object.keys(data).filter((k) => k !== "hash").sort();
  return keys.map((k) => `${k}=${data[k]}`).join("\n");
}

function verifyTelegramAuth(data: Record<string, unknown>, botToken: string): boolean {
  const received = typeof data.hash === "string" ? data.hash.trim() : "";
  if (!received) return false;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "hash") continue;
    if (v === undefined || v === null) continue;
    flat[k] = String(v);
  }
  const checkString = telegramDataCheckString(flat);
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  try {
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

let cachedBotUsername: string | null | undefined = undefined;

/** Username del bot per il widget Login (data-telegram-login); da getMe, così serve solo TELEGRAM_BOT_TOKEN. */
async function getTelegramBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    cachedBotUsername = null;
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const j = (await r.json()) as { ok?: boolean; result?: { username?: string } };
    if (j.ok && j.result?.username) {
      cachedBotUsername = j.result.username;
      return cachedBotUsername;
    }
  } catch {
    /* ignore */
  }
  cachedBotUsername = null;
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlTelegramSuccess(token: string): string {
  const payload = JSON.stringify({ type: "iota-auth-token", token });
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>IOTA Auth</title></head>
<body style="margin:0;background:#0b0c0f;color:#a1a1aa;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">
<p style="margin:0;font-size:0.9rem;">Accesso completato. Questa finestra si chiude…</p>
<script>
(function(){
  var payload = ${payload};
  try {
    if (window.opener) {
      window.opener.postMessage(payload, "*");
    }
  } catch (e) {}
  window.close();
})();
</script>
</body>
</html>`;
}

function htmlTelegramError(message: string, _httpStatus: number): string {
  const payload = JSON.stringify({ type: "iota-auth-error", error: message });
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Errore</title></head>
<body style="margin:0;background:#0b0c0f;color:#f87171;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">
<p style="margin:0;font-size:0.9rem;max-width:320px;text-align:center;">${escapeHtml(message)}</p>
<script>
(function(){
  var payload = ${payload};
  try {
    if (window.opener) {
      window.opener.postMessage(payload, "*");
    }
  } catch (e) {}
  setTimeout(function(){ window.close(); }, 400);
})();
</script>
</body>
</html>`;
}

type TelegramVerifyResult =
  | { ok: true; token: string; user: DbUser }
  | { ok: false; status: number; message: string };

async function processTelegramVerify(body: Record<string, unknown>): Promise<TelegramVerifyResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return { ok: false, status: 503, message: "TELEGRAM_BOT_TOKEN non configurato" };
  }
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, message: "Body JSON richiesto" };
  }
  if (!verifyTelegramAuth(body, botToken)) {
    return { ok: false, status: 401, message: "Firma Telegram non valida" };
  }
  const authDate = Number(body.auth_date);
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 300) {
    return { ok: false, status: 401, message: "auth_date troppo vecchio" };
  }
  const id = body.id;
  const providerId = typeof id === "number" ? String(id) : typeof id === "string" ? id : "";
  if (!providerId) {
    return { ok: false, status: 400, message: "Campo id mancante" };
  }
  const first = typeof body.first_name === "string" ? body.first_name : "";
  const last = typeof body.last_name === "string" ? body.last_name : "";
  const name = [first, last].filter(Boolean).join(" ") || first || "Telegram user";
  const picture = typeof body.photo_url === "string" ? body.photo_url : null;

  const providerType: AuthProviderType = "telegram";
  let user = await db.findUserByProvider(providerId, providerType);
  if (!user) {
    const mnemonic = generateMnemonic(wordlist, 256);
    const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
    const {
      did,
      didDocument,
      DIDCreationTx,
      walletAddress,
      didGasMode,
    } = await createDid(keypair, { mnemonic });

    const { secretKey } = decodeIotaPrivateKey(keypair.getSecretKey());
    const { encryptedPrivateKey, iv, salt } = encryptAgentPrivateKey(providerId, secretKey);

    let airdropTxHash: string | undefined;
    if (process.env.WELCOME_AIRDROP_ENABLED?.toLowerCase() === "true") {
      try {
        const amountIota = Number.parseFloat(process.env.WELCOME_AIRDROP_AMOUNT ?? "0");
        if (amountIota > 0 && walletAddress) {
          const nanos = BigInt(Math.round(amountIota * 1e9));
          airdropTxHash = await transferFromMaster(walletAddress, nanos);
        }
      } catch {
        /* ignore */
      }
    }

    user = {
      providerId,
      providerType,
      email: null,
      name,
      picture,
      did,
      didDocument,
      DIDCreationTx,
      didGasMode,
      walletAddress,
      encryptedPrivateKey,
      iv,
      salt,
      ...(airdropTxHash ? { airdropTxHash } : {}),
      createdAt: new Date().toISOString(),
    };
    await db.addUser(user);
  } else {
    await db.updateUserByProvider(providerId, providerType, { name, picture: picture ?? user.picture });
    user = (await db.findUserByProvider(providerId, providerType))!;
  }

  const token = signUserJwt(user);
  return { ok: true, token, user };
}

router.get("/telegram/login", async (_req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!botToken) {
      res.status(503).type("html").send(htmlTelegramError("Telegram non configurato sul server.", 503));
      return;
    }
    const botUsername = await getTelegramBotUsername();
    if (!botUsername) {
      res
        .status(503)
        .type("html")
        .send(htmlTelegramError("Impossibile risolvere lo username del bot (getMe).", 503));
      return;
    }
    const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IOTA Auth — Telegram</title>
  <style>
    body { margin:0; min-height:100vh; background:#0b0c0f; color:#e8eaef; font-family:system-ui,sans-serif;
      display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; box-sizing:border-box; }
    .logo { font-size:1.35rem; font-weight:700; letter-spacing:-0.02em; margin:0 0 8px; color:#f4f4f5; }
    .sub { color:#a1a1aa; font-size:0.95rem; margin:0 0 24px; text-align:center; max-width:280px; }
  </style>
</head>
<body>
  <p class="logo">IOTA Auth</p>
  <p class="sub">Accedi con il tuo account Telegram</p>
  <div id="tg-widget"></div>
  <script>
    function onTelegramAuth(user) {
      fetch("/auth/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/html" },
        body: JSON.stringify(user),
      }).then(function (r) { return r.text(); }).then(function (html) {
        document.open();
        document.write(html);
        document.close();
      }).catch(function () {
        document.body.innerHTML = '<p style="color:#f87171;padding:24px;text-align:center;font-family:system-ui,sans-serif;">Errore di rete</p>';
      });
    }
  </script>
  <script async src="https://telegram.org/js/telegram-widget.js?22"
    data-telegram-login="${escapeHtml(botUsername)}"
    data-size="large"
    data-onauth="onTelegramAuth(user)"
    data-request-access="write"></script>
</body>
</html>`;
    res.type("html").send(html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    console.error("[auth/telegram/login]", e);
    res.status(500).type("html").send(htmlTelegramError(msg, 500));
  }
});

router.post("/telegram/verify", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await processTelegramVerify(body);
    if (!result.ok) {
      res.status(result.status).type("html").send(htmlTelegramError(result.message, result.status));
      return;
    }
    res.type("html").send(htmlTelegramSuccess(result.token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore Telegram";
    console.error("[auth/telegram/verify]", e);
    res.status(500).type("html").send(htmlTelegramError(msg, 500));
  }
});

export default router;
