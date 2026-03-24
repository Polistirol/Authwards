import { useCallback, useEffect, useMemo, useState } from "react";

import type { Agent, AgentLog, AgentStatus } from "../sdk";

type AgentCardProps = {
  agent: Agent;
  backendUrl: string;
  logs: AgentLog[];
  onOpenSnippet: () => void;
  onOpenFund: () => void;
  onRevoke: () => Promise<boolean>;
  onActivate: (agentDid: string) => Promise<{ ok: boolean; error?: string }>;
  fetchAgentLogs: (agentDid: string) => Promise<void>;
};

function truncateDid(did: string, len = 20): string {
  if (did.length <= len) return did;
  return `${did.slice(0, len)}...`;
}

function effectiveStatus(agent: Agent): AgentStatus {
  if (agent.status === "pending_activation") return "created";
  if (agent.status) return agent.status;
  if (agent.active === false) return "revoked";
  if (agent.active === true) return "active";
  return "created";
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function permissionCaps(agent: Agent): {
  maxTxIota: string;
  maxDayIota: string;
} {
  if (agent.permitMaxPerTxIota != null && agent.permitMaxPerDayIota != null) {
    return {
      maxTxIota: agent.permitMaxPerTxIota,
      maxDayIota: agent.permitMaxPerDayIota,
    };
  }
  switch (agent.permissionProfile) {
    case "readonly":
      return { maxTxIota: "0", maxDayIota: "0" };
    case "low_value":
      return { maxTxIota: "5", maxDayIota: "20" };
    case "custom":
      return { maxTxIota: "—", maxDayIota: "—" };
    case "full_access":
      return { maxTxIota: "1000", maxDayIota: "10000" };
    default:
      return { maxTxIota: "—", maxDayIota: "—" };
  }
}

function permitExpiryLabel(agent: Agent): string {
  const ms = agent.permitExpiresAtMs;
  if (!ms || ms === "0") return "Mai";
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function nanosToIota(nanos: string | undefined): bigint {
  try {
    return BigInt(nanos ?? "0");
  } catch {
    return 0n;
  }
}

function formatIota(n: bigint): string {
  const v = Number(n) / 1e9;
  if (Number.isNaN(v)) return "0";
  return v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatLogLine(log: AgentLog): string {
  const data = log.data;
  if (typeof data === "object" && data !== null && "message" in data) {
    return String((data as { message: unknown }).message);
  }
  try {
    return JSON.stringify(log.data);
  } catch {
    return String(log.data);
  }
}

function logTypeClass(type: string): string {
  switch (type) {
    case "message":
      return "text-slate-300";
    case "tx_success":
      return "text-emerald-400";
    case "tx_fail":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

export default function AgentCard({
  agent,
  backendUrl,
  logs,
  onOpenSnippet,
  onOpenFund,
  onRevoke,
  onActivate,
  fetchAgentLogs,
}: AgentCardProps) {
  const [copied, setCopied] = useState(false);
  const [balanceNanos, setBalanceNanos] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateConfirm, setActivateConfirm] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const status = effectiveStatus(agent);
  const caps = permissionCaps(agent);

  const spentToday = useMemo(() => {
    const n = nanosToIota(agent.spentTodayNanos);
    if (agent.spentTodayDate !== utcToday()) return 0n;
    return n;
  }, [agent.spentTodayNanos, agent.spentTodayDate]);

  const trimBackend = useCallback(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  useEffect(() => {
    const walletAddress = agent.walletAddress;
    if (!walletAddress) {
      setBalanceNanos(null);
      return;
    }
    let cancelled = false;
    const balanceUrl = `${trimBackend()}/wallet/balance/${encodeURIComponent(walletAddress)}`;

    async function load(): Promise<void> {
      try {
        const res = await fetch(balanceUrl);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { balance?: string };
        if (!cancelled && json.balance !== undefined) setBalanceNanos(json.balance);
      } catch {
        if (!cancelled) setBalanceNanos(null);
      }
    }

    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [agent.walletAddress, trimBackend]);

  async function copyDid(): Promise<void> {
    try {
      await navigator.clipboard.writeText(agent.agentDid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function expandHistory(): Promise<void> {
    if (!historyOpen) {
      setHistoryOpen(true);
      setHistoryLoading(true);
      await fetchAgentLogs(agent.agentDid);
      setHistoryLoading(false);
    } else {
      setHistoryOpen(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (
      !window.confirm(
        "Sei sicuro di voler revocare questo agente? L’azione non è reversibile.",
      )
    ) {
      return;
    }
    await onRevoke();
  }

  function openActivateModal(): void {
    setActivateError(null);
    setActivateConfirm(false);
    setActivateOpen(true);
  }

  async function handleConfirmActivate(): Promise<void> {
    const profile = agent.permissionProfile;
    if (
      (profile === "low_value" ||
        profile === "full_access" ||
        profile === "custom") &&
      !activateConfirm
    ) {
      return;
    }
    setActivating(true);
    setActivateError(null);
    const result = await onActivate(agent.agentDid);
    setActivating(false);
    if (result.ok) {
      setActivateOpen(false);
    } else {
      setActivateError(result.error ?? "Attivazione non riuscita");
    }
  }

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [logs],
  );

  const displayName = agent.name?.trim() || "Agente senza nome";

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 border-b border-white/10 pb-4">
        <h3 className="text-lg font-semibold text-white">{displayName}</h3>
        {agent.description?.trim() ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {agent.description.trim()}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            DID
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
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${profileBadge(agent.permissionProfile)}`}
          >
            {profileLabel(agent.permissionProfile)}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-xl border border-[#2a2d3a] bg-[#12131a]/80 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Wallet</p>
          <p className="mt-1 break-all font-mono text-xs text-[#6ee7b7]">
            {agent.walletAddress || "—"}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Saldo:{" "}
            <span className="font-mono text-[#6ee7b7]">
              {balanceNanos !== null
                ? `${formatIota(BigInt(balanceNanos))} IOTA`
                : "…"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Permessi</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-400">
            <li>Max per transazione: {caps.maxTxIota} IOTA</li>
            <li>Max per giorno: {caps.maxDayIota} IOTA</li>
            <li>Speso oggi (UTC): {formatIota(spentToday)} IOTA</li>
            <li>Scadenza permit: {permitExpiryLabel(agent)}</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Creato il</p>
          <p className="mt-1 text-sm text-slate-200">
            {formatDate(agent.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Attivato il</p>
          <p className="mt-1 text-sm text-slate-200">
            {status === "active" && agent.activatedAt
              ? formatDate(agent.activatedAt)
              : "—"}
          </p>
        </div>
      </div>

      {status === "revoked" ? null : (
        <div className="mt-5 flex flex-wrap gap-2">
          {status === "created" ? (
            <button
              type="button"
              onClick={() => openActivateModal()}
              className="rounded-lg bg-[#6ee7b7] px-5 py-2.5 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8]"
            >
              Attiva Agente
            </button>
          ) : null}
          {status === "active" ? (
            <button
              type="button"
              onClick={onOpenSnippet}
              className="rounded-lg border border-[#6ee7b7]/40 bg-[#6ee7b7]/10 px-4 py-2 text-sm font-medium text-[#6ee7b7] hover:bg-[#6ee7b7]/20"
            >
              Vedi Snippet
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSnippet}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Vedi Snippet
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFund}
            disabled={!agent.walletAddress}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fondi Agente
          </button>
          {status === "active" ? (
            <button
              type="button"
              onClick={() => void handleRevoke()}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20"
            >
              Revoca
            </button>
          ) : null}
        </div>
      )}

      {activateOpen ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => !activating && setActivateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="activate-agent-title"
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12141c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="activate-agent-title"
              className="text-lg font-semibold text-white"
            >
              Attiva {displayName}
            </h2>
            <ActivateModalBody
              agent={agent}
              caps={caps}
              permitExpiryLabel={permitExpiryLabel(agent)}
              activateConfirm={activateConfirm}
              setActivateConfirm={setActivateConfirm}
            />
            {activateError ? (
              <p className="mt-4 text-sm text-red-400">{activateError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={activating}
                onClick={() => setActivateOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Annulla
              </button>
              <ActivateConfirmButton
                profile={agent.permissionProfile}
                activateConfirm={activateConfirm}
                activating={activating}
                onClick={() => void handleConfirmActivate()}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => void expandHistory()}
          className="text-sm font-medium text-[#6ee7b7] hover:underline"
        >
          {historyOpen ? "Nascondi storico transazioni" : "Vedi storico transazioni"}
        </button>
        {historyOpen ? (
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-2">
            {historyLoading ? (
              <p className="text-xs text-slate-500">Caricamento…</p>
            ) : sortedLogs.length === 0 ? (
              <p className="text-xs text-slate-500">Nessun log.</p>
            ) : (
              sortedLogs.map((log, idx) => (
                <div
                  key={`${log.timestamp}-${idx}`}
                  className="rounded border border-white/5 px-2 py-1.5 font-mono text-xs"
                >
                  <span className="text-slate-500">
                    {formatDate(log.timestamp)}{" "}
                  </span>
                  <span className={logTypeClass(log.type)}>{log.type}</span>
                  <p className="mt-0.5 text-slate-300">{formatLogLine(log)}</p>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function profileBadge(profile: string): string {
  switch (profile) {
    case "readonly":
      return "bg-slate-600/40 text-slate-200 border-slate-500/50";
    case "low_value":
      return "bg-amber-500/20 text-amber-200 border-amber-500/40";
    case "custom":
      return "bg-sky-500/20 text-sky-200 border-sky-500/40";
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
    case "custom":
      return "Personalizzato";
    case "full_access":
      return "Full access";
    default:
      return profile;
  }
}

type Caps = { maxTxIota: string; maxDayIota: string };

function ActivateModalBody({
  agent,
  caps,
  permitExpiryLabel,
  activateConfirm,
  setActivateConfirm,
}: {
  agent: Agent;
  caps: Caps;
  permitExpiryLabel: string;
  activateConfirm: boolean;
  setActivateConfirm: (v: boolean) => void;
}) {
  const profile = agent.permissionProfile;

  if (profile === "readonly") {
    return (
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
        <p>
          Stai per attivare questo agente. Potrà monitorare dati on-chain ma non
          potrà eseguire transazioni.
        </p>
      </div>
    );
  }

  if (profile === "low_value") {
    return (
      <div className="mt-4 space-y-4 text-sm">
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
          Stai per abilitare questo agente a spendere autonomamente dal suo
          wallet.
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-300">
          <li>Max per transazione: {caps.maxTxIota} IOTA</li>
          <li>Max al giorno: {caps.maxDayIota} IOTA</li>
          <li>
            Scadenza: {permitExpiryLabel === "Mai" ? "nessuna" : permitExpiryLabel}
          </li>
        </ul>
        <p className="text-slate-400">
          Una volta attivato, qualsiasi workflow collegato con lo snippet potrà
          eseguire transazioni entro questi limiti.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-slate-200">
          <input
            type="checkbox"
            className="mt-1 accent-[#6ee7b7]"
            checked={activateConfirm}
            onChange={(e) => setActivateConfirm(e.target.checked)}
          />
          <span>Confermo di voler attivare questo agente</span>
        </label>
      </div>
    );
  }

  if (profile === "full_access") {
    return (
      <div className="mt-4 space-y-4 text-sm">
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-medium text-red-200">
          ATTENZIONE: stai per abilitare questo agente SENZA limiti di spesa.
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-300">
          <li>
            Max per transazione:{" "}
            <span className="font-semibold text-red-300">Nessun limite</span>
          </li>
          <li>
            Max al giorno:{" "}
            <span className="font-semibold text-red-300">Nessun limite</span>
          </li>
          <li>
            Scadenza: {permitExpiryLabel === "Mai" ? "nessuna" : permitExpiryLabel}
          </li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 text-slate-200">
          <input
            type="checkbox"
            className="mt-1 accent-red-500"
            checked={activateConfirm}
            onChange={(e) => setActivateConfirm(e.target.checked)}
          />
          <span>Confermo di voler attivare questo agente senza limiti di spesa</span>
        </label>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 text-sm">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
        Stai per abilitare questo agente con i limiti personalizzati sotto.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-300">
        <li>Max per transazione: {caps.maxTxIota} IOTA</li>
        <li>Max al giorno: {caps.maxDayIota} IOTA</li>
        <li>
          Scadenza: {permitExpiryLabel === "Mai" ? "nessuna" : permitExpiryLabel}
        </li>
      </ul>
      <label className="flex cursor-pointer items-start gap-3 text-slate-200">
        <input
          type="checkbox"
          className="mt-1 accent-[#6ee7b7]"
          checked={activateConfirm}
          onChange={(e) => setActivateConfirm(e.target.checked)}
        />
        <span>Confermo di voler attivare questo agente</span>
      </label>
    </div>
  );
}

function ActivateConfirmButton({
  profile,
  activateConfirm,
  activating,
  onClick,
}: {
  profile: string;
  activateConfirm: boolean;
  activating: boolean;
  onClick: () => void;
}) {
  const needsCheck =
    profile === "low_value" ||
    profile === "full_access" ||
    profile === "custom";
  const disabled = activating || (needsCheck && !activateConfirm);

  if (profile === "readonly") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {activating ? "Attivazione…" : "Attiva"}
      </button>
    );
  }

  if (profile === "full_access") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {activating ? "Attivazione…" : "Attiva Agente"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-[#6ee7b7] px-5 py-2 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {activating ? "Attivazione…" : "Attiva Agente"}
    </button>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === "created" || status === "pending_activation") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/20 px-4 py-1.5 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
        Non attivato
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-sm font-semibold text-emerald-200">
        Attivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-red-500/50 bg-red-500/15 px-4 py-1.5 text-sm font-semibold text-red-200">
      Revocato
    </span>
  );
}
