import { useMemo, useState } from "react";

import type { Agent, AgentLog } from "../sdk";

type AgentCardProps = {
  agent: Agent;
  logs: AgentLog[];
};

function truncateDid(did: string, len = 20): string {
  if (did.length <= len) return did;
  return `${did.slice(0, len)}...`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatLogData(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function logTypeClass(type: string): string {
  switch (type) {
    case "check":
      return "text-slate-400";
    case "trigger":
      return "text-amber-300";
    case "tx_success":
      return "text-emerald-400";
    case "tx_fail":
      return "text-red-400";
    case "permission_denied":
      return "text-orange-400";
    case "start":
      return "text-cyan-400/90";
    case "error":
      return "text-red-300";
    default:
      return "text-slate-300";
  }
}

function badgeClass(profile: string): string {
  switch (profile) {
    case "readonly":
      return "bg-slate-600/40 text-slate-200 border-slate-500/50";
    case "low_value":
      return "bg-amber-500/20 text-amber-200 border-amber-500/40";
    case "full_access":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
    default:
      return "bg-white/10 text-slate-200 border-white/20";
  }
}

function profileLabel(profile: string): string {
  switch (profile) {
    case "readonly":
      return "Read only";
    case "low_value":
      return "Low value";
    case "full_access":
      return "Full access";
    default:
      return profile;
  }
}

export default function AgentCard({ agent, logs }: AgentCardProps) {
  const [copied, setCopied] = useState(false);

  const recentLogs = useMemo(() => {
    const sorted = [...logs].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
    return sorted.slice(0, 20);
  }, [logs]);

  async function copyDid(): Promise<void> {
    try {
      await navigator.clipboard.writeText(agent.agentDid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Agente
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="truncate text-sm text-[#e2e4ed]">
              {truncateDid(agent.agentDid)}
            </code>
            <button
              type="button"
              onClick={() => void copyDid()}
              className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-[#6ee7b7] hover:bg-white/10"
            >
              {copied ? "Copiato" : "Copia DID"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass(agent.permissionProfile)}`}
          >
            {profileLabel(agent.permissionProfile)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className={`h-2 w-2 rounded-full ${agent.active ? "bg-emerald-400" : "bg-red-500"}`}
            />
            {agent.active ? "Attivo" : "Inattivo"}
          </span>
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold text-white">Log attività</h3>
        <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1 text-sm">
          {recentLogs.length === 0 ? (
            <li className="text-xs text-slate-500">Nessun log ancora.</li>
          ) : (
            recentLogs.map((log, idx) => (
              <li
                key={`${log.timestamp}-${log.type}-${idx}`}
                className="log-fade-in rounded-lg border border-white/5 bg-black/20 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-slate-500">
                    {formatTime(log.timestamp)}
                  </span>
                  <span
                    className={`text-xs font-semibold uppercase ${logTypeClass(log.type)}`}
                  >
                    {log.type}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">
                  {formatLogData(log.data)}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </article>
  );
}
