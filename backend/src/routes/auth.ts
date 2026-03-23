import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Profile } from "passport-google-oauth20";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";

import { isOriginAllowed } from "../allowedFrontendOrigins.js";
import * as db from "../services/db.js";
import { createDid } from "../services/did.js";
import { encryptAgentPrivateKey } from "../services/agentCrypto.js";
import { transferFromMaster } from "../services/masterWallet.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import type { DbUser } from "../types/db.js";

export type PassportGoogleState = { profile: Profile };

const router = Router();

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET non configurato");
  return s;
}

function getFrontendUrl(): string {
  const u = process.env.FRONTEND_URL;
  if (!u) throw new Error("FRONTEND_URL non configurato");
  return u.replace(/\/+$/, "");
}

function encodeOAuthReturnState(returnToUrl: string): string {
  return Buffer.from(returnToUrl, "utf8").toString("base64url");
}

function decodeOAuthReturnState(state: unknown): string | null {
  if (typeof state !== "string" || !state) return null;
  try {
    return Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function isAllowedReturnUrl(fullUrl: string): boolean {
  try {
    const u = new URL(fullUrl);
    if (!/^https?:$/i.test(u.protocol)) return false;
    return isOriginAllowed(`${u.protocol}//${u.host}`);
  } catch {
    return false;
  }
}

function resolveReturnToFromQuery(returnToParam: unknown, fallback: string): string {
  if (typeof returnToParam !== "string" || !returnToParam.trim()) return fallback;
  const trimmed = returnToParam.trim();
  try {
    const u = new URL(trimmed);
    if (!/^https?:$/i.test(u.protocol)) return fallback;
    if (!isOriginAllowed(`${u.protocol}//${u.host}`)) return fallback;
    return trimmed;
  } catch {
    return fallback;
  }
}

function redirectBaseFromState(req: { query: Record<string, unknown> }, fallback: string): string {
  const raw = req.query.state;
  const state = Array.isArray(raw) ? raw[0] : raw;
  const decoded = decodeOAuthReturnState(state);
  if (decoded && isAllowedReturnUrl(decoded)) return decoded;
  return fallback;
}

/** Risposta API: niente chiave cifrata né mnemonic. */
function toPublicUser(u: DbUser) {
  const {
    encryptedPrivateKey: _enc,
    iv: _iv,
    salt: _salt,
    ...rest
  } = u;
  return rest;
}

export function configureGoogleAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;
  if (!clientID || !clientSecret || !callbackURL) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_CALLBACK_URL mancanti");
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        done(null, { profile } satisfies PassportGoogleState);
      },
    ),
  );
}

router.get("/google", (req, res, next) => {
  try {
    const fallback = getFrontendUrl();
    const rt = req.query.return_to;
    const returnToParam = Array.isArray(rt) ? rt[0] : rt;
    const returnTo = resolveReturnToFromQuery(returnToParam, fallback);
    const state = encodeOAuthReturnState(returnTo);
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
      state,
    })(req, res, next);
  } catch (e) {
    next(e);
  }
});

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${getFrontendUrl()}?error=google_auth` }),
  async (req, res) => {
    const fallback = getFrontendUrl();
    const returnBase = redirectBaseFromState(req, fallback);
    try {
      const { profile } = req.user as unknown as PassportGoogleState;
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value ?? "";
      const name = profile.displayName ?? "";
      const picture = profile.photos?.[0]?.value ?? "";

      let user = await db.findUserByGoogleId(googleId);
      let firstLoginMnemonic: string | undefined;
      let firstLoginPrivateKeyHex: string | undefined;

      if (!user) {
        const mnemonic = generateMnemonic(wordlist, 256);
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
        const {
          did,
          didDocument,
          DIDCreationTx,
          walletAddress,
          privateKeyHex,
          didGasMode,
        } = await createDid(keypair, { mnemonic });

        const { secretKey } = decodeIotaPrivateKey(keypair.getSecretKey());
        const { encryptedPrivateKey, iv, salt } = encryptAgentPrivateKey(googleId, secretKey);

        let airdropTxHash: string | undefined;
        if (process.env.WELCOME_AIRDROP_ENABLED?.toLowerCase() === "true") {
          try {
            const amountIota = Number.parseFloat(process.env.WELCOME_AIRDROP_AMOUNT ?? "0");
            if (amountIota > 0) {
              const nanos = BigInt(Math.round(amountIota * 1e9));
              const digest = await transferFromMaster(walletAddress, nanos);
              airdropTxHash = digest;
              console.log(
                `[auth] Welcome airdrop: sent ${amountIota} IOTA to ${walletAddress} (tx: ${digest})`,
              );
            }
          } catch (airErr) {
            console.warn("[auth] Welcome airdrop fallito (login continua):", airErr);
          }
        }

        user = {
          googleId,
          email,
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
        firstLoginMnemonic = mnemonic;
        firstLoginPrivateKeyHex = privateKeyHex;
      }

      const tokenPayload: Record<string, string | boolean | undefined> = {
        googleId: user.googleId,
        did: user.did,
        email: user.email,
        name: user.name,
        walletAddress: user.walletAddress,
      };

      if (firstLoginMnemonic) {
        tokenPayload.firstLogin = true;
        tokenPayload.mnemonic = firstLoginMnemonic;
        tokenPayload.privateKeyHex = firstLoginPrivateKeyHex;
      }

      const token = jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: "24h" });

      const redirect = new URL(returnBase);
      redirect.searchParams.set("token", token);
      if (firstLoginMnemonic) {
        redirect.searchParams.set("firstLogin", "true");
        redirect.searchParams.set("recovery", firstLoginMnemonic);
      }
      console.log(
        `[auth] OAuth OK → redirect a ${redirect.origin}${redirect.pathname} (token JWT emesso, googleId=${user.googleId.slice(0, 8)}…)`,
      );
      res.redirect(redirect.toString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore durante il login";
      console.error("[auth] OAuth callback errore (es. IOTA/faucet):", msg);
      const redirect = new URL(returnBase);
      redirect.searchParams.set("error", "oauth_callback");
      redirect.searchParams.set("detail", msg.slice(0, 200));
      res.redirect(redirect.toString());
    }
  },
);

router.get("/me", requireJwt, async (req, res) => {
  try {
    const jwtUser = req.user as JwtUserPayload;
    const user = await db.findUserByGoogleId(jwtUser.googleId);
    if (!user) {
      res.status(404).json({ error: "Utente non trovato" });
      return;
    }
    res.json(toPublicUser(user));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    res.status(500).json({ error: msg });
  }
});

export default router;
