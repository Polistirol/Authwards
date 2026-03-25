import type { Request, Response, NextFunction } from "express";

import * as db from "../services/db.js";
import type { DbAgent } from "../types/db.js";

declare module "express-serve-static-core" {
  interface Request {
    /** Agent row from DB (Agent Bridge). */
    agent?: DbAgent;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const t = header.slice("Bearer ".length).trim();
  return t || null;
}

/** Authenticates via `Authorization: Bearer <agentToken>` by looking up db.json. */
export async function requireAgentToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "Unauthorized", message: "Missing or invalid Authorization header" });
      return;
    }
    const agent = await db.findAgentByToken(token);
    if (!agent) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid agent token" });
      return;
    }
    req.agent = agent;
    next();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auth error";
    res.status(500).json({ error: msg });
  }
}
