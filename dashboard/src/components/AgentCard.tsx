import { useCallback, useEffect, useMemo, useState } from "react";

import type { Agent, AgentLog, AgentStatus } from "../sdk";

import { nanosToIotaString } from "../lib/units";

import { IconArrowTopRightOnSquare, IconCheck, IconClipboard, IconTrash } from "./icons";

type AgentCardProps = {
  agent: Agent;
  backendUrl: string;
  /** Bumps when the dashboard invalidates cached balances (funding, withdraw, etc.). */
  agentBalanceEpoch: number;
  token: string | null;
  /** Called after a successful withdraw so balances / agent list stay in sync. */
  onRefreshAgent?: () => void;
  logs: AgentLog[];
  onOpenSnippet: () => void;
  onOpenFund: () => void;
  onRevoke: () => Promise<boolean>;
  onDeleteAgent: (agentDid: string) => Promise<boolean>;
  onActivate: (agentDid: string) => Promise<{ ok: boolean; error?: string }>;
  fetchAgentLogs: (agentDid: string) => Promise<void>;
};

function truncateWalletAddress(addr: string): string {
  const a = addr.trim();
  if (a.length <= 14) return a;
  if (a.startsWith("0x") && a.length > 10) {
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function explorerObjectUrl(objectId: string, agentDid: string): string {
  const base = `https://explorer.iota.org/object/${encodeURIComponent(objectId)}`;
  const m = agentDid.match(/did:iota:([^:]+):/);
  const net = m?.[1];
  if (net && net !== "mainnet") {
    return `${base}?network=${encodeURIComponent(net)}`;
  }
  return base;
}

/** Short label: `iota:did:0xaaaa...bbbb` from `did:iota:<net>:0x...`. */
function formatAgentDidDisplay(did: string): string {
  const trimmed = did.trim();
  const parts = trimmed.split(":");
  const last = parts[parts.length - 1] ?? "";
  if (last.startsWith("0x") && last.length > 2) {
    return `iota:did:${truncateWalletAddress(last)}`;
  }
  return trimmed;
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
  if (!ms || ms === "0") return "Never";
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
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
  return d.toLocaleString("en-US", {
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
  agentBalanceEpoch,
  token,
  onRefreshAgent,
  logs,
  onOpenSnippet,
  onOpenFund,
  onRevoke,
  onDeleteAgent,
  onActivate,
  fetchAgentLogs,
}: AgentCardProps) {
  const [copiedField, setCopiedField] = useState<"did" | "wallet" | "delegateToken" | null>(null);
  const [cardExpanded, setCardExpanded] = useState(false);
  const [balanceNanos, setBalanceNanos] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateConfirm, setActivateConfirm] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [revokeModal, setRevokeModal] = useState<null | "balance" | "confirm">(null);
  const [revokeBalanceNanos, setRevokeBalanceNanos] = useState<bigint | null>(null);
  const [revokeOpening, setRevokeOpening] = useState(false);
  const [withdrawAllBusy, setWithdrawAllBusy] = useState(false);
  const [revokeExecuting, setRevokeExecuting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        const json = (await res.json()) as { balanceNanos?: string; balance?: string };
        const nanos = json.balanceNanos ?? json.balance;
        if (!cancelled && nanos !== undefined) setBalanceNanos(nanos);
      } catch {
        if (!cancelled) setBalanceNanos(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [agent.walletAddress, trimBackend, agentBalanceEpoch]);

  async function copyToClipboard(
    text: string,
    field: "did" | "wallet" | "delegateToken",
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
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

  function closeRevokeModals(): void {
    setRevokeModal(null);
    setRevokeBalanceNanos(null);
    setRevokeError(null);
  }

  async function openRevokeFlow(): Promise<void> {
    setRevokeError(null);
    setRevokeBalanceNanos(null);
    const addr = agent.walletAddress?.trim();
    if (!addr) {
      setRevokeModal("confirm");
      return;
    }
    setRevokeOpening(true);
    try {
      const res = await fetch(
        `${trimBackend()}/wallet/balance/${encodeURIComponent(addr)}`,
      );
      const json = (await res.json()) as {
        balanceNanos?: string;
        balance?: string;
        error?: string;
      };
      if (!res.ok) {
        setRevokeModal("confirm");
        return;
      }
      const raw = json.balanceNanos ?? json.balance;
      const nanos = BigInt(raw !== undefined && raw !== null ? String(raw) : "0");
      if (nanos > 0n) {
        setRevokeBalanceNanos(nanos);
        setRevokeModal("balance");
      } else {
        setRevokeModal("confirm");
      }
    } catch {
      setRevokeModal("confirm");
    } finally {
      setRevokeOpening(false);
    }
  }

  async function withdrawAllBeforeRevoke(): Promise<void> {
    if (!token) {
      setRevokeError("You need to be signed in to withdraw.");
      return;
    }
    const addr = agent.walletAddress?.trim();
    if (!addr) return;
    setWithdrawAllBusy(true);
    setRevokeError(null);
    try {
      const balRes = await fetch(
        `${trimBackend()}/wallet/balance/${encodeURIComponent(addr)}`,
      );
      const balJson = (await balRes.json()) as {
        balanceNanos?: string;
        balance?: string;
      };
      if (!balRes.ok) {
        setRevokeError("Could not read delegate balance.");
        return;
      }
      const raw = balJson.balanceNanos ?? balJson.balance;
      const nanos = BigInt(raw !== undefined && raw !== null ? String(raw) : "0");
      if (nanos <= 0n) {
        setRevokeModal("confirm");
        return;
      }
      const wRes = await fetch(`${trimBackend()}/wallet/withdraw-from-agent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentDid: agent.agentDid, amount: Number(nanos) }),
      });
      const wJson: unknown = await wRes.json();
      if (!wRes.ok) {
        let msg = "Withdraw failed.";
        if (typeof wJson === "object" && wJson) {
          const o = wJson as { message?: unknown; error?: unknown };
          if (typeof o.message === "string" && o.message.trim()) msg = o.message;
          else if (o.error != null) msg = String(o.error);
        }
        setRevokeError(msg);
        return;
      }
      onRefreshAgent?.();
      setRevokeModal("confirm");
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : "Network error");
    } finally {
      setWithdrawAllBusy(false);
    }
  }

  async function executeRevoke(): Promise<void> {
    setRevokeExecuting(true);
    setRevokeError(null);
    try {
      const ok = await onRevoke();
      if (ok) {
        onRefreshAgent?.();
        closeRevokeModals();
      } else setRevokeError("Revocation failed. Try again.");
    } finally {
      setRevokeExecuting(false);
    }
  }

  async function executeDeleteFromDashboard(): Promise<void> {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const ok = await onDeleteAgent(agent.agentDid);
      if (ok) {
        setDeleteModalOpen(false);
        onRefreshAgent?.();
      } else {
        setDeleteError("Could not remove this delegate. Try again.");
      }
    } finally {
      setDeleteBusy(false);
    }
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
      setActivateError(result.error ?? "Activation failed");
    }
  }

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [logs],
  );

  const displayName = agent.name?.trim() || "Unnamed delegate";

  const walletAddr = agent.walletAddress?.trim() ?? "";
  const permitId = agent.permitObjectId?.trim() ?? "";
  const delegateToken = agent.agentToken?.trim() ?? "";

  return (
    <article
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      aria-label="Delegate card"
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
        <button
          type="button"
          aria-expanded={cardExpanded}
          aria-label={cardExpanded ? "Collapse delegate card" : "Expand delegate card"}
          onClick={() => setCardExpanded((v) => !v)}
          className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-white/5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-white">
              {displayName}
            </h3>
            <StatusLed status={status} />
          </div>
          {cardExpanded && agent.description?.trim() ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {agent.description.trim()}
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={cardExpanded}
            aria-label={cardExpanded ? "Collapse delegate card" : "Expand delegate card"}
            onClick={() => setCardExpanded((v) => !v)}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronDownIcon className={`h-5 w-5 transition-transform ${cardExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {cardExpanded ? (
        <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            DID
          </p>
          <div className="mt-1 flex flex-wrap items-start gap-2">
            <code
              className="break-all font-mono text-sm leading-snug text-aw-accent"
              title={agent.agentDid}
            >
              {formatAgentDidDisplay(agent.agentDid)}
            </code>
            <button
              type="button"
              onClick={() => void copyToClipboard(agent.agentDid, "did")}
              aria-label="Copy DID"
              title={copiedField === "did" ? "Copied" : "Copy DID"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
            >
              {copiedField === "did" ? (
                <IconCheck className="h-3.5 w-3.5 text-aw-accent" />
              ) : (
                <IconClipboard className="h-3.5 w-3.5" />
              )}
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

      <div className="mt-6 grid gap-4 rounded-xl border border-aw-border/80 bg-aw-surface/80 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Wallet</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p
              className="min-w-0 font-mono text-sm text-aw-accent"
              title={walletAddr || undefined}
            >
              {walletAddr ? truncateWalletAddress(walletAddr) : "—"}
            </p>
            {walletAddr ? (
              <button
                type="button"
                onClick={() => void copyToClipboard(walletAddr, "wallet")}
                aria-label="Copy wallet address"
                title={copiedField === "wallet" ? "Copied" : "Copy wallet address"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
              >
                {copiedField === "wallet" ? (
                  <IconCheck className="h-3.5 w-3.5 text-aw-accent" />
                ) : (
                  <IconClipboard className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Balance:{" "}
            <span className="font-mono text-aw-accent">
              {balanceNanos !== null
                ? `${formatIota(BigInt(balanceNanos))} IOTA`
                : "…"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Permissions</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-400">
            <li>Max per transaction: {caps.maxTxIota} IOTA</li>
            <li>Max per day: {caps.maxDayIota} IOTA</li>
            <li>Spent today (UTC): {formatIota(spentToday)} IOTA</li>
            <li>Permit expiry: {permitExpiryLabel(agent)}</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Delegate token</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 break-all font-mono text-sm text-aw-accent"
              title={delegateToken || undefined}
            >
              {delegateToken ? formatDelegateToken(delegateToken) : "—"}
            </code>
            {delegateToken ? (
              <button
                type="button"
                onClick={() => void copyToClipboard(delegateToken, "delegateToken")}
                aria-label="Copy delegate token"
                title={copiedField === "delegateToken" ? "Copied" : "Copy delegate token"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
              >
                {copiedField === "delegateToken" ? (
                  <IconCheck className="h-3.5 w-3.5 text-aw-accent" />
                ) : (
                  <IconClipboard className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-xs font-medium uppercase text-slate-500">
            Delegate permit ID
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 break-all font-mono text-sm text-aw-accent"
              title={permitId || undefined}
            >
              {permitId ? truncateWalletAddress(permitId) : "—"}
            </code>
            {permitId ? (
              <a
                href={explorerObjectUrl(permitId, agent.agentDid)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View permit on IOTA Explorer"
                title="Open in IOTA Explorer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                <IconArrowTopRightOnSquare className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Created</p>
          <p className="mt-1 text-sm text-slate-200">
            {formatDate(agent.createdAt)}
          </p>
          <p className="mt-3 text-xs font-medium uppercase text-slate-500">Activated</p>
          <p className="mt-1 text-sm text-slate-200">
            {status === "active" && agent.activatedAt
              ? formatDate(agent.activatedAt)
              : "—"}
          </p>
        </div>
      </div>

      {status === "revoked" ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            aria-label="Remove delegate from dashboard"
            title="Remove from dashboard"
            onClick={() => {
              setDeleteError(null);
              setDeleteModalOpen(true);
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/55 bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {status === "created" ? (
            <button
              type="button"
              onClick={() => openActivateModal()}
              className="rounded-lg bg-aw-accent px-5 py-2.5 text-sm font-semibold text-aw-on-accent hover:bg-aw-accent-hover"
            >
              Activate delegate
            </button>
          ) : null}
          {status === "active" ? (
            <button
              type="button"
              onClick={onOpenSnippet}
              className="rounded-lg border border-aw-accent/40 bg-aw-accent/10 px-4 py-2 text-sm font-medium text-aw-accent hover:bg-aw-accent/20"
            >
              Connect
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSnippet}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Connect
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFund}
            disabled={!agent.walletAddress}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Manage funds
          </button>
          {status === "active" ? (
            <button
              type="button"
              disabled={revokeOpening}
              onClick={() => void openRevokeFlow()}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revokeOpening ? "Checking…" : "Revoke"}
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-6 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => void expandHistory()}
          className="text-sm font-medium text-aw-accent hover:underline"
        >
          {historyOpen ? "Hide transaction history" : "View transaction history"}
        </button>
        {historyOpen ? (
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-2">
            {historyLoading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : sortedLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No logs.</p>
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
        </>
      ) : null}

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => !deleteBusy && setDeleteModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-delegate-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-aw-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-delegate-title"
              className="text-lg font-semibold text-white"
            >
              Remove from dashboard?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              This will only remove{" "}
              <span className="font-medium text-white">{displayName}</span> from your Authwards dashboard. Its
              addresses and transaction history will still remain on-chain.
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-400">{deleteError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteModalOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void executeDeleteFromDashboard()}
                className="rounded-lg border border-red-500/50 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25"
              >
                {deleteBusy ? "Removing…" : "Delete from dashboard"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeModal === "balance" && revokeBalanceNanos !== null && revokeBalanceNanos > 0n ? (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() =>
            !withdrawAllBusy && closeRevokeModals()
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-balance-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-aw-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="revoke-balance-title"
              className="text-lg font-semibold text-white"
            >
              Revoke delegate
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
              <p>
                This delegate&apos;s wallet still holds{" "}
                <span className="font-mono text-aw-accent">
                  {nanosToIotaString(revokeBalanceNanos)}
                </span>{" "}
                IOTA.
              </p>
              <p className="text-slate-400">
                Once revoked, this delegate can no longer sign transactions or transfer funds on your
                behalf. If you need those tokens back in your account wallet, withdraw the full balance
                first. You can also revoke anyway and leave the funds on this address.
              </p>
              <p className="text-slate-200">
                Withdraw all available funds to your wallet now?
              </p>
            </div>
            {revokeError ? (
              <p className="mt-3 text-sm text-red-400">{revokeError}</p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={withdrawAllBusy}
                onClick={closeRevokeModals}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={withdrawAllBusy}
                onClick={() => {
                  setRevokeError(null);
                  setRevokeModal("confirm");
                }}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Revoke without withdrawing
              </button>
              <button
                type="button"
                disabled={withdrawAllBusy || !token}
                onClick={() => void withdrawAllBeforeRevoke()}
                className="rounded-lg bg-aw-accent px-4 py-2 text-sm font-semibold text-aw-on-accent hover:bg-aw-accent-hover disabled:opacity-50"
              >
                {withdrawAllBusy ? "Withdrawing…" : "Withdraw all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeModal === "confirm" ? (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => !revokeExecuting && closeRevokeModals()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-confirm-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-aw-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="revoke-confirm-title"
              className="text-lg font-semibold text-white"
            >
              Revoke {displayName}?
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              This cannot be undone. The delegate will stop working in your workflows and can no longer
              act on your behalf.
            </p>
            {revokeError ? (
              <p className="mt-3 text-sm text-red-400">{revokeError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={revokeExecuting}
                onClick={closeRevokeModals}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revokeExecuting}
                onClick={() => void executeRevoke()}
                className="rounded-lg border border-red-500/50 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25"
              >
                {revokeExecuting ? "Revoking…" : "Revoke delegate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activateOpen ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => !activating && setActivateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="activate-delegate-title"
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-aw-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="activate-delegate-title"
              className="text-lg font-semibold text-white"
            >
              Activate {displayName}
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
                Cancel
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
    </article>
  );
}

function formatDelegateToken(token: string): string {
  const t = token.trim();
  if (!t) return t;
  if (t.startsWith("agt_")) {
    const body = t.slice(4);
    if (body.length > 7) {
      return `agt_${body.slice(0, 2)}...${body.slice(-5)}`;
    }
  }
  if (t.length > 11) {
    return `${t.slice(0, 6)}...${t.slice(-5)}`;
  }
  return t;
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
      return "Read Only";
    case "low_value":
      return "Low Value";
    case "custom":
      return "Custom";
    case "full_access":
      return "Full Access";
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
          You are about to activate this delegate. It can monitor on-chain data but cannot
          execute transactions.
        </p>
      </div>
    );
  }

  if (profile === "low_value") {
    return (
      <div className="mt-4 space-y-4 text-sm">
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
          You are about to enable this delegate to spend autonomously from its wallet.
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-300">
          <li>Max per transaction: {caps.maxTxIota} IOTA</li>
          <li>Max per day: {caps.maxDayIota} IOTA</li>
          <li>
            Expiry: {permitExpiryLabel === "Never" ? "none" : permitExpiryLabel}
          </li>
        </ul>
        <p className="text-slate-400">
          Once active, any workflow connected via the snippet can execute transactions within
          these limits.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-slate-200">
          <input
            type="checkbox"
            className="mt-1 accent-aw-accent"
            checked={activateConfirm}
            onChange={(e) => setActivateConfirm(e.target.checked)}
          />
          <span>I confirm I want to activate this delegate</span>
        </label>
      </div>
    );
  }

  if (profile === "full_access") {
    return (
      <div className="mt-4 space-y-4 text-sm">
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-medium text-red-200">
          WARNING: you are about to enable this delegate with NO spending limits.
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-300">
          <li>
            Max per transaction:{" "}
            <span className="font-semibold text-red-300">No limit</span>
          </li>
          <li>
            Max per day:{" "}
            <span className="font-semibold text-red-300">No limit</span>
          </li>
          <li>
            Expiry: {permitExpiryLabel === "Never" ? "none" : permitExpiryLabel}
          </li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 text-slate-200">
          <input
            type="checkbox"
            className="mt-1 accent-red-500"
            checked={activateConfirm}
            onChange={(e) => setActivateConfirm(e.target.checked)}
          />
          <span>I confirm I want to activate this delegate with no spending limits</span>
        </label>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 text-sm">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
        You are about to enable this delegate with the custom limits below.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-300">
        <li>Max per transaction: {caps.maxTxIota} IOTA</li>
        <li>Max per day: {caps.maxDayIota} IOTA</li>
        <li>
          Expiry: {permitExpiryLabel === "Never" ? "none" : permitExpiryLabel}
        </li>
      </ul>
      <label className="flex cursor-pointer items-start gap-3 text-slate-200">
        <input
          type="checkbox"
          className="mt-1 accent-aw-accent"
          checked={activateConfirm}
          onChange={(e) => setActivateConfirm(e.target.checked)}
        />
        <span>I confirm I want to activate this delegate</span>
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
        {activating ? "Activating…" : "Activate delegate"}
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
        {activating ? "Activating…" : "Activate delegate"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-aw-accent px-5 py-2 text-sm font-semibold text-aw-on-accent hover:bg-aw-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {activating ? "Activating…" : "Activate delegate"}
    </button>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === "created" || status === "pending_activation") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/20 px-4 py-1.5 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
        Not activated
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-sm font-semibold text-emerald-200">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-red-500/50 bg-red-500/15 px-4 py-1.5 text-sm font-semibold text-red-200">
      Revoked
    </span>
  );
}

function StatusLed({ status }: { status: AgentStatus }) {
  if (status === "created" || status === "pending_activation") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]"
        title="Not activated"
        aria-hidden
      />
    );
  }
  if (status === "active") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
        title="Active"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]"
      title="Revoked"
      aria-hidden
    />
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

