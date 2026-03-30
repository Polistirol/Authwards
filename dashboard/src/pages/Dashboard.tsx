import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { ConnectButton, useAgent, useAuthwards } from "../sdk";
import type { Agent, AgentStatus, CreateAgentResult, User } from "../sdk";
import AgentCard from "../components/AgentCard";
import FundAgentModal from "../components/FundAgentModal";
import WalletSection from "../components/WalletSection";
import { IconArrowTopRightOnSquare, IconCheck, IconClipboard } from "../components/icons";
import { explorerAddressUrl, explorerDidObjectUrl } from "../lib/explorer";
import SnippetModal from "../components/SnippetModal";
import TrustChain from "../components/TrustChain";

/** Set to `true` to show the Trust Chain section (schema) below the delegate list. */
const SHOW_TRUST_CHAIN_SECTION = false;

/** Wallet activity is hidden for logged-in dashboard (set `true` to show the on-chain tx list again). */
const SHOW_WALLET_ACTIVITY_SECTION = false;

function highlightJsonText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /("(?:[^"\\]|\\.)*")\s*(:)|("(?:[^"\\]|\\.)*")|(\btrue|false|null\b)|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={key++} className="text-slate-300">
          {text.slice(last, m.index)}
        </span>,
      );
    }
    if (m[1] && m[2]) {
      out.push(
        <span key={key++} className="text-sky-400">
          {m[1]}
        </span>,
      );
      out.push(
        <span key={key++} className="text-slate-400">
          {m[2]}{" "}
        </span>,
      );
    } else if (m[3]) {
      out.push(
        <span key={key++} className="text-amber-400/90">
          {m[3]}
        </span>,
      );
    } else if (m[4]) {
      out.push(
        <span key={key++} className="text-amber-300">
          {m[4]}
        </span>,
      );
    } else if (m[5]) {
      out.push(
        <span key={key++} className="text-amber-200">
          {m[5]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    out.push(
      <span key={key++} className="text-slate-300">
        {text.slice(last)}
      </span>,
    );
  }
  return out;
}

function DidDocumentBlock({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const json = useMemo(
    () => JSON.stringify(user.didDocument ?? {}, null, 2),
    [user.didDocument],
  );

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-aw-accent hover:bg-white/10"
      >
        {open ? "Hide DID Document" : "Show DID Document"}
      </button>
      {open ? (
        <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed">
          {highlightJsonText(json)}
        </pre>
      ) : null}
    </div>
  );
}

function effectiveAgentStatus(agent: Agent): AgentStatus {
  if (agent.status === "pending_activation") return "created";
  if (agent.status) return agent.status;
  if (agent.active === false) return "revoked";
  if (agent.active === true) return "active";
  return "created";
}

const PROFILES = [
  {
    id: "readonly" as const,
    title: "Read Only",
    description: "No spending; monitoring only",
  },
  {
    id: "custom" as const,
    title: "Custom",
    description: "Set max IOTA per transaction and per day yourself",
  },
  {
    id: "full_access" as const,
    title: "Full Access",
    description: "Maximum allowed by the contract (1000 / 10000 IOTA per day)",
  },
];

/** Value for `datetime-local` (local wall time, same encoding as `defaultExpiresLocal`). */
function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

function defaultExpiresLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toDatetimeLocalValue(d);
}

function nowExpiresLocal(): string {
  return toDatetimeLocalValue(new Date());
}

function formatIotaFromNanos(nanos: string | undefined): string {
  try {
    const n = BigInt(nanos ?? "0");
    const v = Number(n) / 1e9;
    if (Number.isNaN(v)) return "0";
    return v >= 1 ? v.toFixed(4) : v.toFixed(6);
  } catch {
    return "0";
  }
}

export default function Dashboard() {
  const { user, did, isAuthenticated, loading, backendUrl, token } =
    useAuthwards();
  const {
    agents,
    loading: agentsLoading,
    createAgent,
    agentLogs,
    fetchAgentLogs,
    revokeAgent,
    deleteAgent,
    refreshAgents,
    activateAgent,
  } = useAgent();

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<"pick" | "success">("pick");
  const [createResult, setCreateResult] = useState<CreateAgentResult | null>(
    null,
  );
  const [profile, setProfile] = useState<
    "readonly" | "custom" | "full_access"
  >("readonly");
  const [customMaxPerTx, setCustomMaxPerTx] = useState(5);
  const [customMaxPerDay, setCustomMaxPerDay] = useState(20);
  const [noPermitExpiry, setNoPermitExpiry] = useState(true);
  const [expiresAtLocal, setExpiresAtLocal] = useState(defaultExpiresLocal);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [didCopied, setDidCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [userBalanceNanos, setUserBalanceNanos] = useState<string | null>(null);

  const [snippetAgentDid, setSnippetAgentDid] = useState<string | null>(null);
  const [snippetStatus, setSnippetStatus] = useState<AgentStatus>("created");

  const [fundModal, setFundModal] = useState<{
    agentDid: string;
    walletAddress: string;
  } | null>(null);

  /** Increments to trigger delegate wallet balance refetch on cards (no polling). */
  const [agentBalanceEpoch, setAgentBalanceEpoch] = useState(0);
  const bumpAgentBalances = useCallback(() => {
    setAgentBalanceEpoch((n) => n + 1);
  }, []);
  /** Increments to refetch account wallet balance (identity section) without waiting for the 15s poll. */
  const [userBalanceEpoch, setUserBalanceEpoch] = useState(0);
  const bumpUserBalance = useCallback(() => {
    setUserBalanceEpoch((n) => n + 1);
  }, []);
  const refreshAgentsAndBalances = useCallback(() => {
    void refreshAgents();
    bumpAgentBalances();
    bumpUserBalance();
  }, [refreshAgents, bumpAgentBalances, bumpUserBalance]);

  const prevStatusRef = useRef<Map<string, AgentStatus>>(new Map());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    for (const a of agents) {
      const cur = effectiveAgentStatus(a);
      const prev = prevStatusRef.current.get(a.agentDid);
      if (
        (prev === "created" || prev === "pending_activation") &&
        cur === "active"
      ) {
        setToast("Delegate activated!");
        window.setTimeout(() => setToast(null), 6000);
      }
      prevStatusRef.current.set(a.agentDid, cur);
    }
  }, [agents]);

  const trimBackend = useCallback(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  const copyDid = useCallback(async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      setDidCopied(true);
      setTimeout(() => setDidCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [did]);

  const copyWallet = useCallback(async () => {
    const w = user?.walletAddress;
    if (!w) return;
    try {
      await navigator.clipboard.writeText(w);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [user?.walletAddress]);

  useEffect(() => {
    const addr = user?.walletAddress;
    if (!addr) {
      setUserBalanceNanos(null);
      return;
    }
    let cancelled = false;
    const url = `${trimBackend()}/wallet/balance/${encodeURIComponent(addr)}`;
    async function load(): Promise<void> {
      try {
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { balanceNanos?: string; balance?: string };
        const nanos = json.balanceNanos ?? json.balance;
        if (!cancelled && nanos !== undefined) {
          setUserBalanceNanos(nanos);
        }
      } catch {
        if (!cancelled) setUserBalanceNanos(null);
      }
    }
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.walletAddress, trimBackend, userBalanceEpoch]);

  const openSnippetFor = useCallback((agent: Agent) => {
    setSnippetAgentDid(agent.agentDid);
    setSnippetStatus(effectiveAgentStatus(agent));
  }, []);

  function resetCreateDialog(): void {
    setCreating(false);
    setCreateOpen(false);
    setCreateStep("pick");
    setCreateResult(null);
    setAgentName("");
    setAgentDescription("");
    setProfile("readonly");
    setCustomMaxPerTx(5);
    setCustomMaxPerDay(20);
    setNoPermitExpiry(true);
    setExpiresAtLocal(defaultExpiresLocal());
  }

  async function handleCreateAgent(): Promise<void> {
    if (!agentName.trim()) {
      return;
    }
    if (profile === "custom") {
      if (
        !Number.isFinite(customMaxPerTx) ||
        !Number.isFinite(customMaxPerDay) ||
        customMaxPerTx < 0 ||
        customMaxPerDay < 0
      ) {
        return;
      }
    }
    let permitExpiresAtMs = 0;
    if (!noPermitExpiry) {
      const t = new Date(expiresAtLocal).getTime();
      if (Number.isNaN(t)) {
        return;
      }
      permitExpiresAtMs = t;
    }
    setCreating(true);
    try {
      const result = await createAgent({
        permissionProfile: profile,
        name: agentName.trim(),
        description: agentDescription.trim(),
        ...(profile === "custom"
          ? {
              customMaxPerTxIota: customMaxPerTx,
              customMaxPerDayIota: customMaxPerDay,
            }
          : {}),
        permitExpiresAtMs,
      });
      if (result) {
        setCreateResult(result);
        setCreateStep("success");
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-aw-bg text-aw-text">
        <p className="text-sm opacity-70">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user || !did) {
    return <Navigate to="/" replace />;
  }

  const didExplorerHref =
    explorerDidObjectUrl(did) ??
    `https://explorer.iota.org/testnet/did/${encodeURIComponent(did)}`;

  return (
    <div className="min-h-screen bg-aw-bg text-aw-text">
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[185] max-w-md -translate-x-1/2 rounded-xl border border-aw-accent/40 bg-aw-panel px-5 py-3 text-center text-sm text-white shadow-xl"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <span className="text-sm font-semibold tracking-wide text-aw-accent">
            Authwards
          </span>
          <ConnectButton theme="dark" hideDashboardLink />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-6 py-10">
        <section>
          <h2 className="text-lg font-semibold text-white">Your Identity</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="border-b border-white/10 pb-6">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Wallet
              </p>
              {user.walletAddress ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="break-all font-mono text-sm text-aw-accent">
                      {user.walletAddress}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyWallet()}
                      aria-label="Copy wallet address"
                      title={walletCopied ? "Copied" : "Copy wallet address"}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
                    >
                      {walletCopied ? (
                        <IconCheck className="h-3.5 w-3.5 text-aw-accent" />
                      ) : (
                        <IconClipboard className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={explorerAddressUrl(user.walletAddress, did)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View wallet on IOTA Explorer"
                      title="Open address in IOTA Explorer"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-300 hover:bg-white/10"
                    >
                      <IconArrowTopRightOnSquare className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    Balance:{" "}
                    <span className="font-mono text-aw-accent">
                      {userBalanceNanos !== null
                        ? `${formatIotaFromNanos(userBalanceNanos)} IOTA`
                        : "…"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No wallet linked to this account (complete OAuth onboarding).
                </p>
              )}
            </div>
            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">
              DID
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all text-sm text-aw-accent">{did}</code>
              <button
                type="button"
                onClick={() => void copyDid()}
                aria-label="Copy DID"
                title={didCopied ? "Copied" : "Copy DID"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
              >
                {didCopied ? (
                  <IconCheck className="h-3.5 w-3.5 text-aw-accent" />
                ) : (
                  <IconClipboard className="h-3.5 w-3.5" />
                )}
              </button>
              <a
                href={didExplorerHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View DID on IOTA Explorer"
                title="Open DID object in IOTA Explorer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                <IconArrowTopRightOnSquare className="h-3.5 w-3.5" />
              </a>
            </div>
            <DidDocumentBlock user={user} />
          </div>
        </section>

        {SHOW_WALLET_ACTIVITY_SECTION ? <WalletSection /> : null}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Delegates</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Create delegate identities and connect them to your preferred workflow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateStep("pick");
                setCreateResult(null);
                setAgentName("");
                setAgentDescription("");
                setProfile("readonly");
                setCustomMaxPerTx(5);
                setCustomMaxPerDay(20);
                setNoPermitExpiry(true);
                setExpiresAtLocal(defaultExpiresLocal());
                setCreateOpen(true);
              }}
              className="rounded-xl bg-aw-accent px-5 py-2.5 text-sm font-semibold text-aw-on-accent hover:bg-aw-accent-hover"
            >
              Create Delegate Identity
            </button>
          </div>

          {agentsLoading && agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Loading delegates…</p>
          ) : agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No delegates yet. Create a delegate identity and connect it to n8n, a bot,
              or any service.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agentDid}
                  agent={agent}
                  backendUrl={backendUrl}
                  agentBalanceEpoch={agentBalanceEpoch}
                  token={token}
                  onRefreshAgent={refreshAgentsAndBalances}
                  logs={agentLogs.get(agent.agentDid) ?? []}
                  fetchAgentLogs={fetchAgentLogs}
                  onOpenSnippet={() => openSnippetFor(agent)}
                  onOpenFund={() =>
                    agent.walletAddress
                      ? (() => {
                          bumpAgentBalances();
                          setFundModal({
                            agentDid: agent.agentDid,
                            walletAddress: agent.walletAddress,
                          });
                        })()
                      : undefined
                  }
                  onRevoke={() => revokeAgent(agent.agentDid)}
                  onDeleteAgent={(did) => deleteAgent(did)}
                  onActivate={activateAgent}
                />
              ))}
            </div>
          )}
        </section>

        {SHOW_TRUST_CHAIN_SECTION ? (
          <TrustChain userName={user.name} userDid={did} agents={agents} />
        ) : null}
      </main>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-delegate-title"
            className="flex max-h-[min(92vh,900px)] w-full max-w-[44.8rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-aw-panel shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <h2
                id="new-delegate-title"
                className={`text-lg font-semibold sm:text-xl ${
                  createStep === "pick" ? "text-white" : "text-aw-accent"
                }`}
              >
                {createStep === "pick"
                  ? "Create Delegate Identity"
                  : "Delegate identity created"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => resetCreateDialog()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-lg leading-none text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
            {createStep === "pick" ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="agent-name"
                      className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Name
                    </label>
                    <input
                      id="agent-name"
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="e.g. Balance monitor"
                      autoComplete="off"
                      className="mt-2 w-full rounded-xl border border-aw-border/90 bg-aw-inset px-4 py-3 text-sm text-aw-text placeholder:text-slate-600 focus:border-aw-accent/50 focus:outline-none focus:ring-1 focus:ring-aw-accent/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="agent-desc"
                      className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Description
                    </label>
                    <textarea
                      id="agent-desc"
                      value={agentDescription}
                      onChange={(e) => setAgentDescription(e.target.value)}
                      placeholder="Describe what this delegate will do in your workflow…"
                      rows={3}
                      className="mt-2 w-full resize-y rounded-xl border border-aw-border/90 bg-aw-inset px-4 py-3 text-sm text-aw-text placeholder:text-slate-600 focus:border-aw-accent/50 focus:outline-none focus:ring-1 focus:ring-aw-accent/30"
                    />
                  </div>
                </div>
                <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Permission profile
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PROFILES.map((p) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition sm:min-h-[7.5rem] ${
                        profile === p.id
                          ? "border-aw-accent/60 bg-aw-accent/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="perm"
                          className="mt-0.5 accent-aw-accent"
                          checked={profile === p.id}
                          onChange={() => setProfile(p.id)}
                        />
                        <span className="font-medium text-white">{p.title}</span>
                      </div>
                      <span className="block pl-6 text-sm leading-snug text-slate-400">
                        {p.description}
                      </span>
                    </label>
                  ))}
                </div>
                {profile === "custom" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="custom-max-tx"
                        className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                      >
                        Max IOTA per transaction
                      </label>
                      <input
                        id="custom-max-tx"
                        type="number"
                        min={0}
                        step={1}
                        value={customMaxPerTx}
                        onChange={(e) => setCustomMaxPerTx(Number(e.target.value))}
                        className="mt-2 w-full rounded-xl border border-aw-border/90 bg-aw-inset px-4 py-2.5 text-sm text-aw-text focus:border-aw-accent/50 focus:outline-none focus:ring-1 focus:ring-aw-accent/30"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-max-day"
                        className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                      >
                        Max IOTA per day
                      </label>
                      <input
                        id="custom-max-day"
                        type="number"
                        min={0}
                        step={1}
                        value={customMaxPerDay}
                        onChange={(e) => setCustomMaxPerDay(Number(e.target.value))}
                        className="mt-2 w-full rounded-xl border border-aw-border/90 bg-aw-inset px-4 py-2.5 text-sm text-aw-text focus:border-aw-accent/50 focus:outline-none focus:ring-1 focus:ring-aw-accent/30"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="accent-aw-accent"
                      checked={noPermitExpiry}
                      onChange={(e) => {
                        const noExpiry = e.target.checked;
                        setNoPermitExpiry(noExpiry);
                        if (!noExpiry) {
                          setExpiresAtLocal(nowExpiresLocal());
                        }
                      }}
                    />
                    <span className="text-sm text-slate-300">
                      No on-chain permit expiry
                    </span>
                  </label>
                  {!noPermitExpiry ? (
                    <div>
                      <label
                        htmlFor="permit-expires"
                        className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                      >
                        Permit expiry (local)
                      </label>
                      <input
                        id="permit-expires"
                        type="datetime-local"
                        value={expiresAtLocal}
                        onChange={(e) => setExpiresAtLocal(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-aw-border/90 bg-aw-inset px-4 py-2.5 text-sm text-aw-text focus:border-aw-accent/50 focus:outline-none focus:ring-1 focus:ring-aw-accent/30"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-6">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => resetCreateDialog()}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={creating || !agentName.trim()}
                    onClick={() => void handleCreateAgent()}
                    className="rounded-lg bg-aw-accent px-5 py-2 text-sm font-semibold text-aw-on-accent hover:bg-aw-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create delegate"}
                  </button>
                </div>
              </>
            ) : createResult ? (
              <>
                <div className="space-y-3 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-500">Name</span>
                    <br />
                    <span className="text-white">{createResult.name}</span>
                  </p>
                  {createResult.description ? (
                    <p>
                      <span className="text-slate-500">Description</span>
                      <br />
                      <span className="text-slate-300">{createResult.description}</span>
                    </p>
                  ) : null}
                  <p>
                    <span className="text-slate-500">Delegate DID</span>
                    <br />
                    <code className="break-all text-aw-accent">
                      {createResult.agentDid}
                    </code>
                  </p>
                  <p>
                    <span className="text-slate-500">Delegate wallet</span>
                    <br />
                    <code className="break-all text-aw-accent">
                      {createResult.walletAddress}
                    </code>
                  </p>
                  <p>
                    <span className="text-slate-500">Status</span>
                    <br />
                    <span className="font-semibold text-amber-200">Not activated</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Use{" "}
                    <span className="font-semibold text-aw-accent">Activate delegate</span> on the
                    card when you are ready.
                  </p>
                  <p className="pt-2 text-slate-400">
                    You can already copy the snippet to prepare your workflow; the delegate will
                    work after activation from the dashboard.
                  </p>
                </div>
                <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => resetCreateDialog()}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {snippetAgentDid ? (
        <SnippetModal
          open
          onClose={() => setSnippetAgentDid(null)}
          agentDid={snippetAgentDid}
          agentStatus={snippetStatus}
          backendUrl={backendUrl}
          token={token}
        />
      ) : null}

      {fundModal ? (
        <FundAgentModal
          open
          onClose={() => {
            refreshAgentsAndBalances();
            setFundModal(null);
          }}
          agentDid={fundModal.agentDid}
          toAddress={fundModal.walletAddress}
          backendUrl={backendUrl}
          token={token}
          onSuccess={() => {
            refreshAgentsAndBalances();
          }}
        />
      ) : null}

    </div>
  );
}
