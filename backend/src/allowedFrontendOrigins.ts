/** Origins allowed for CORS and OAuth return_to / post-login redirect. */

function normalizeOrigin(input: string): string {
  const u = new URL(input.includes("://") ? input : `https://${input}`);
  return `${u.protocol}//${u.host}`;
}

export function getAllowedFrontendOrigins(): string[] {
  const multi = process.env.FRONTEND_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const single = process.env.FRONTEND_URL?.trim();
  let list: string[] = [];
  if (multi && multi.length > 0) list = [...multi];
  else if (single) list = [single];

  if (list.length === 0) {
    return ["http://localhost:5173", "http://localhost:5174"].map(normalizeOrigin);
  }

  list = list.map(normalizeOrigin);

  const allLocalhost = list.every((o) => /localhost|127\.0\.0\.1/.test(o));
  const sdkConsole = normalizeOrigin("http://localhost:5174");
  if (allLocalhost && !list.includes(sdkConsole)) list.push(sdkConsole);

  return list;
}

export function isOriginAllowed(origin: string): boolean {
  const n = normalizeOrigin(origin);
  return getAllowedFrontendOrigins().includes(n);
}
