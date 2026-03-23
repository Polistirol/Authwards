import type { AgentLog } from "./types";

export function normalizeAgentLog(raw: unknown): AgentLog | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.agentDid !== "string") return null;

  const timestamp =
    typeof o.timestamp === "string"
      ? o.timestamp
      : typeof o.createdAt === "string"
        ? o.createdAt
        : new Date().toISOString();

  const type =
    typeof o.type === "string"
      ? o.type
      : typeof o.message === "string"
        ? "message"
        : "log";

  const data =
    o.data !== undefined
      ? o.data
      : { message: o.message, meta: o.meta };

  return { agentDid: o.agentDid, timestamp, type, data };
}

export function normalizeAgentLogList(raw: unknown): AgentLog[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLog[] = [];
  for (const item of raw) {
    const log = normalizeAgentLog(item);
    if (log) out.push(log);
  }
  return out;
}
