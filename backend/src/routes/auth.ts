import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Profile } from "passport-google-oauth20";

import { isOriginAllowed } from "../allowedFrontendOrigins.js";
import * as db from "../services/db.js";
import { createDid } from "../services/did.js";
import { requireJwt, type JwtUserPayload } from "../middleware/auth.js";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";

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
      if (!user) {
        const keypair = Ed25519Keypair.generate();
        const { did, didDocument, DIDCreationTx } = await createDid(keypair);
        user = {
          googleId,
          email,
          name,
          picture,
          did,
          didDocument,
          DIDCreationTx,
          createdAt: new Date().toISOString(),
        };
        await db.addUser(user);
      }

      const token = jwt.sign(
        {
          googleId: user.googleId,
          did: user.did,
          email: user.email,
          name: user.name,
        },
        getJwtSecret(),
        { expiresIn: "24h" },
      );

      const redirect = new URL(returnBase);
      redirect.searchParams.set("token", token);
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
    res.json(user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    res.status(500).json({ error: msg });
  }
});

export default router;
