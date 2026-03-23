import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type JwtUserPayload = {
  googleId: string;
  did: string;
  email: string;
  name: string;
  walletAddress?: string;
  /** Solo al primo login (OAuth). */
  firstLogin?: boolean;
  mnemonic?: string;
  privateKeyHex?: string;
};

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
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & JwtUserPayload;
    if (!decoded.googleId || !decoded.did || !decoded.email) {
      res.status(401).json({ error: "Token non valido" });
      return;
    }
    req.user = {
      googleId: decoded.googleId,
      did: decoded.did,
      email: decoded.email,
      name: decoded.name ?? "",
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
