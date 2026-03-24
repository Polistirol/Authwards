import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import type { AuthProviderType } from "../types/db.js";

function isAuthProviderType(v: unknown): v is AuthProviderType {
  return v === "google" || v === "github" || v === "wallet" || v === "telegram";
}

export type JwtUserPayload = {
  providerId: string;
  providerType: AuthProviderType;
  did: string;
  email: string | null;
  name: string;
  walletAddress?: string;
  /** Solo al primo login (OAuth). */
  firstLogin?: boolean;
  mnemonic?: string;
  privateKeyHex?: string;
  /** JWT legacy (pre providerId). */
  googleId?: string;
};

function resolveProviderIdentity(
  decoded: jwt.JwtPayload & Partial<JwtUserPayload> & { googleId?: string },
): { providerId: string; providerType: AuthProviderType } | null {
  if (typeof decoded.providerId === "string" && decoded.providerId) {
    const pt = decoded.providerType;
    if (isAuthProviderType(pt)) {
      return { providerId: decoded.providerId, providerType: pt };
    }
  }
  if (typeof decoded.googleId === "string" && decoded.googleId) {
    return { providerId: decoded.googleId, providerType: "google" };
  }
  return null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtUserPayload;
  }
}

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: "JWT_SECRET non configurato" });
      return;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token mancante o non valido" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & JwtUserPayload & { googleId?: string };
    const id = resolveProviderIdentity(decoded);
    if (!id || !decoded.did) {
      res.status(401).json({ error: "Token non valido" });
      return;
    }
    const email =
      decoded.email === undefined || decoded.email === null
        ? null
        : typeof decoded.email === "string"
          ? decoded.email
          : null;
    req.user = {
      providerId: id.providerId,
      providerType: id.providerType,
      did: decoded.did,
      email,
      name: typeof decoded.name === "string" ? decoded.name : "",
      walletAddress: decoded.walletAddress,
      firstLogin: decoded.firstLogin,
      mnemonic: decoded.mnemonic,
      privateKeyHex: decoded.privateKeyHex,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token non valido o scaduto" });
  }
}
