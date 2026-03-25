import http from "node:http";

import type { NextFunction, Request, Response } from "express";

function statusLine(code: number): string {
  const name = http.STATUS_CODES[code];
  return name ? `${code} ${name}` : `${code}`;
}

function isVerboseHttpEnabled(): boolean {
  const v = process.env.LOG_HTTP_VERBOSE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Path without query string (stable comparisons). */
function pathOnly(req: Request): string {
  const u = req.originalUrl ?? req.url ?? "/";
  const q = u.indexOf("?");
  return q >= 0 ? u.slice(0, q) : u;
}

/**
 * Logs HTTP requests:
 * - Always: POST/PUT/PATCH/DELETE, responses ≥400, OAuth GET `/auth/google*`, `/auth/github*`
 * - Only when `LOG_HTTP_VERBOSE=true`: other GET/HEAD
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    const method = req.method.toUpperCase();
    const code = res.statusCode;
    const path = pathOnly(req);
    const line = `${method} ${path} ${statusLine(code)}`;

    if (code >= 400) {
      console.log(line);
      return;
    }

    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      console.log(line);
      return;
    }

    if (method === "GET" || method === "HEAD") {
      if (
        path.startsWith("/auth/google") ||
        path.startsWith("/auth/github") ||
        path.startsWith("/auth/wallet") ||
        path.startsWith("/auth/telegram")
      ) {
        console.log(line);
        return;
      }
      if (isVerboseHttpEnabled()) {
        console.log(line);
      }
      return;
    }

    if (isVerboseHttpEnabled()) {
      console.log(line);
    }
  });
  next();
}
