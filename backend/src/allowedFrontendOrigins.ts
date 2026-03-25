/**
 * Origins allowed for CORS and optional OAuth `return_to` when Referer is missing.
 *
 * Third-party dApps do not need listing here if users start login from that origin:
 * `GET /auth/google?return_to=<dapp>` is accepted when Referer matches `return_to`
 * (same origin). Use `FRONTEND_URL` / `FRONTEND_URLS` / `ALLOWED_ORIGINS` for allowlist
 * fallback (e.g. deep links without Referer, mobile quirks, server-side tests).
 */

function normalizeOrigin(input: string): string {
  const u = new URL(input.includes("://") ? input : `https://${input}`);
  return `${u.protocol}//${u.host}`;
}

function dedupeOrigins(origins: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of origins) {
    const n = normalizeOrigin(o);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function getAllowedFrontendOrigins(): string[] {
  const multi = process.env.FRONTEND_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const single = process.env.FRONTEND_URL?.trim();
  const extra = process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let list: string[] = [];
  if (multi && multi.length > 0) list = [...multi];
  else if (single) list = [single];

  if (extra && extra.length > 0) {
    list = [...list, ...extra];
  }

  list = dedupeOrigins(list);

  if (list.length === 0) {
    return ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"].map(
      normalizeOrigin,
    );
  }

  const allLocalhost = list.every((o) => /localhost|127\.0\.0\.1/.test(o));
  const sdkConsole = normalizeOrigin("http://localhost:5174");
  const traceflowDemo = normalizeOrigin("http://localhost:5175");
  if (allLocalhost) {
    if (!list.includes(sdkConsole)) list.push(sdkConsole);
    if (!list.includes(traceflowDemo)) list.push(traceflowDemo);
  }

  return list;
}

export function isOriginAllowed(origin: string): boolean {
  const n = normalizeOrigin(origin);
  return getAllowedFrontendOrigins().includes(n);
}
