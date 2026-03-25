import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAgent, useIotaAuth } from "../sdk";
import type { Agent, AgentStatus, CreateAgentResult, User } from "../sdk";
import AgentCard from "../components/AgentCard";
import FundAgentModal from "../components/FundAgentModal";
import SnippetModal from "../components/SnippetModal";
import TrustChain from "../components/TrustChain";

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
        <span key={key++} className="text-emerald-400">
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
        className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#6ee7b7] hover:bg-white/10"
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

function defaultExpiresLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
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
  const { user, did, isAuthenticated, loading, logout, backendUrl, token } =
    useIotaAuth();
  const {
    agents,
    loading: agentsLoading,
    createAgent,
    agentLogs,
    fetchAgentLogs,
    revokeAgent,
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

  const [fundAddress, setFundAddress] = useState<string | null>(null);

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
        setToast("Agent activated!");
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
        const json = (await res.json()) as { balance?: string };
        if (!cancelled && json.balance !== undefined) {
          setUserBalanceNanos(json.balance);
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
  }, [user?.walletAddress, trimBackend]);

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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] text-[#e2e4ed]">
        <p className="text-sm opacity-70">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user || !did) {
    return <Navigate to="/" replace />;
  }

  const explorerUrl = `https://explorer.iota.org/testnet/did/${encodeURIComponent(did)}`;

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-[#e2e4ed]">
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[185] max-w-md -translate-x-1/2 rounded-xl border border-[#6ee7b7]/40 bg-[#12131a] px-5 py-3 text-center text-sm text-white shadow-xl"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={user.picture ?? undefined}
              alt=""
              className="h-11 w-11 rounded-full border border-white/10"
            />
            <div>
              <p className="font-semibold text-white">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email ?? "—"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Sign out
          </button>
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
                    <code className="break-all font-mono text-sm text-[#6ee7b7]">
                      {user.walletAddress}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyWallet()}
                      className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-[#6ee7b7] hover:bg-white/10"
                    >
                      {walletCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    Balance:{" "}
                    <span className="font-mono text-[#6ee7b7]">
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
              <code className="break-all text-sm text-[#6ee7b7]">{did}</code>
              <button
                type="button"
                onClick={() => void copyDid()}
                className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-[#6ee7b7] hover:bg-white/10"
              >
                {didCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <DidDocumentBlock user={user} />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-[#6ee7b7] underline-offset-4 hover:underline"
            >
              View on IOTA Explorer
            </a>
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Delegated Identities
              </h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Create identities for your agents and connect them to your preferred workflow.
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
              className="rounded-xl bg-[#6ee7b7] px-5 py-2.5 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8]"
            >
              New Delegated Identity
            </button>
          </div>

          {agentsLoading && agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No delegates yet. Create a delegated agent identity and connect it to
              n8n, a bot, or any service.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agentDid}
                  agent={agent}
                  backendUrl={backendUrl}
                  logs={agentLogs.get(agent.agentDid) ?? []}
                  fetchAgentLogs={fetchAgentLogs}
                  onOpenSnippet={() => openSnippetFor(agent)}
                  onOpenFund={() => setFundAddress(agent.walletAddress ?? null)}
                  onRevoke={() => revokeAgent(agent.agentDid)}
                  onActivate={activateAgent}
                />
              ))}
            </div>
          )}
        </section>

        <TrustChain userName={user.name} userDid={did} agents={agents} />
      </main>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-agent-title"
            className="flex max-h-[min(92vh,900px)] w-full max-w-[44.8rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12141c] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <h2
                id="new-agent-title"
                className={`text-lg font-semibold sm:text-xl ${
                  createStep === "pick" ? "text-white" : "text-[#6ee7b7]"
                }`}
              >
                {createStep === "pick"
                  ? "New Delegated Identity"
                  : "Agent identity created"}
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
                      placeholder="e.g. Shipment monitor"
                      autoComplete="off"
                      className="mt-2 w-full rounded-xl border border-[#2a2d3a] bg-[#0a0b0f] px-4 py-3 text-sm text-[#e2e4ed] placeholder:text-slate-600 focus:border-[#6ee7b7]/50 focus:outline-none focus:ring-1 focus:ring-[#6ee7b7]/30"
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
                      placeholder="Describe what this agent will do in your workflow…"
                      rows={3}
                      className="mt-2 w-full resize-y rounded-xl border border-[#2a2d3a] bg-[#0a0b0f] px-4 py-3 text-sm text-[#e2e4ed] placeholder:text-slate-600 focus:border-[#6ee7b7]/50 focus:outline-none focus:ring-1 focus:ring-[#6ee7b7]/30"
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
                          ? "border-[#6ee7b7]/60 bg-[#6ee7b7]/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="perm"
                          className="mt-0.5 accent-[#6ee7b7]"
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
                        className="mt-2 w-full rounded-xl border border-[#2a2d3a] bg-[#0a0b0f] px-4 py-2.5 text-sm text-[#e2e4ed] focus:border-[#6ee7b7]/50 focus:outline-none focus:ring-1 focus:ring-[#6ee7b7]/30"
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
                        className="mt-2 w-full rounded-xl border border-[#2a2d3a] bg-[#0a0b0f] px-4 py-2.5 text-sm text-[#e2e4ed] focus:border-[#6ee7b7]/50 focus:outline-none focus:ring-1 focus:ring-[#6ee7b7]/30"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="accent-[#6ee7b7]"
                      checked={noPermitExpiry}
                      onChange={(e) => setNoPermitExpiry(e.target.checked)}
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
                        className="mt-2 w-full rounded-xl border border-[#2a2d3a] bg-[#0a0b0f] px-4 py-2.5 text-sm text-[#e2e4ed] focus:border-[#6ee7b7]/50 focus:outline-none focus:ring-1 focus:ring-[#6ee7b7]/30"
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
                    className="rounded-lg bg-[#6ee7b7] px-5 py-2 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create"}
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
                    <span className="text-slate-500">Agent DID</span>
                    <br />
                    <code className="break-all text-[#6ee7b7]">
                      {createResult.agentDid}
                    </code>
                  </p>
                  <p>
                    <span className="text-slate-500">Agent wallet</span>
                    <br />
                    <code className="break-all text-[#6ee7b7]">
                      {createResult.walletAddress}
                    </code>
                  </p>
                  <p>
                    <span className="text-slate-500">Status</span>
                    <br />
                    Not activated — use &quot;Activate Agent&quot; on the card when you are
                    ready.
                  </p>
                  <p className="pt-2 text-slate-400">
                    You can already copy the snippet to prepare n8n; the agent will
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
                  <button
                    type="button"
                    onClick={() => {
                      setSnippetAgentDid(createResult.agentDid);
                      setSnippetStatus("created");
                      setCreateOpen(false);
                      setCreateStep("pick");
                      setCreateResult(null);
                    }}
                    className="rounded-lg bg-[#6ee7b7] px-5 py-2 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8]"
                  >
                    Connect your workflow
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

      {fundAddress ? (
        <FundAgentModal
          open
          onClose={() => setFundAddress(null)}
          toAddress={fundAddress}
          backendUrl={backendUrl}
          token={token}
          onSuccess={() => {
            void refreshAgents();
          }}
        />
      ) : null}

    </div>
  );
}
