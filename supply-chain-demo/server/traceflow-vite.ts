import type { IncomingMessage, ServerResponse } from "node:http";

import { CORS_HEADERS, routeShipments } from "./traceflow-core";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer | string) => {
      chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Same-origin /api on Vite dev (port 5175) — no Netlify CLI. */
export function traceflowViteApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api")) {
      next();
      return;
    }

    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 204;
      res.end();
      return;
    }

    let pathname = url.split("?")[0] ?? "/";
    pathname = pathname.replace(/^\/api/, "") || "/";
    if (!pathname.startsWith("/")) pathname = `/${pathname}`;
    pathname = pathname.replace(/\/+$/, "") || "/";
    const segments = pathname.split("/").filter(Boolean);

    let rawBody: string | null = null;
    if (method === "PATCH" || method === "POST" || method === "PUT") {
      rawBody = await readBody(req);
    }

    const out = routeShipments(method, segments, rawBody);
    res.statusCode = out.statusCode;
    Object.entries(out.headers ?? {}).forEach(([k, v]) => {
      if (typeof v === "string") res.setHeader(k, v);
    });
    res.setHeader("Content-Type", "application/json");
    res.end(out.body ?? "{}");
  };
}
