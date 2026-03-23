import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAgent, useIotaAuth } from "../sdk";
import type { User } from "../sdk";
import AgentCard from "../components/AgentCard";
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
        {open ? "Nascondi DID Document" : "Mostra DID Document"}
      </button>
      {open ? (
        <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed">
          {highlightJsonText(json)}
        </pre>
      ) : null}
    </div>
  );
}

const PROFILES = [
  {
    id: "readonly" as const,
    title: "Read Only",
    description: "Monitora senza eseguire transazioni",
  },
  {
    id: "low_value" as const,
    title: "Low Value",
    description: "Max 5 IOTA per transazione, 20/giorno",
  },
  {
    id: "full_access" as const,
    title: "Full Access",
    description: "Nessun limite",
  },
];

export default function Dashboard() {
  const { user, did, isAuthenticated, loading, logout } = useIotaAuth();
  const { agents, loading: agentsLoading, createAgent, agentLogs, connectLogs } =
    useAgent();
  const [createOpen, setCreateOpen] = useState(false);
  const [profile, setProfile] = useState<
    "readonly" | "low_value" | "full_access"
  >("readonly");
  const [creating, setCreating] = useState(false);
  const [didCopied, setDidCopied] = useState(false);

  useEffect(() => {
    if (agents.length === 0) return;
    connectLogs(agents[0].agentDid);
  }, [agents, connectLogs]);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] text-[#e2e4ed]">
        <p className="text-sm opacity-70">Caricamento…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user || !did) {
    return <Navigate to="/" replace />;
  }

  const explorerUrl = `https://explorer.iota.org/testnet/did/${encodeURIComponent(did)}`;

  async function handleCreateAgent(): Promise<void> {
    setCreating(true);
    try {
      await createAgent(profile);
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-[#e2e4ed]">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={user.picture}
              alt=""
              className="h-11 w-11 rounded-full border border-white/10"
            />
            <div>
              <p className="font-semibold text-white">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Esci
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-6 py-10">
        <section>
          <h2 className="text-lg font-semibold text-white">La tua identità</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              DID
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all text-sm text-[#6ee7b7]">{did}</code>
              <button
                type="button"
                onClick={() => void copyDid()}
                className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-[#6ee7b7] hover:bg-white/10"
              >
                {didCopied ? "Copiato" : "Copia"}
              </button>
            </div>
            <DidDocumentBlock user={user} />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-[#6ee7b7] underline-offset-4 hover:underline"
            >
              Vedi su IOTA Explorer
            </a>
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">I tuoi agenti</h2>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-[#6ee7b7] px-5 py-2.5 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8]"
            >
              Crea Agente
            </button>
          </div>

          {agentsLoading && agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Caricamento agenti…</p>
          ) : agents.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              Nessun agente. Creane uno per iniziare.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agentDid}
                  agent={agent}
                  logs={agentLogs.get(agent.agentDid) ?? []}
                />
              ))}
            </div>
          )}
        </section>

        <TrustChain userName={user.name} userDid={did} agents={agents} />
      </main>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-agent-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="new-agent-title"
              className="text-xl font-semibold text-white"
            >
              Nuovo Agente
            </h2>
            <div className="mt-6 space-y-4">
              {PROFILES.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                    profile === p.id
                      ? "border-[#6ee7b7]/60 bg-[#6ee7b7]/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="perm"
                    className="mt-1 accent-[#6ee7b7]"
                    checked={profile === p.id}
                    onChange={() => setProfile(p.id)}
                  />
                  <span>
                    <span className="font-medium text-white">{p.title}</span>
                    <span className="mt-1 block text-sm text-slate-400">
                      {p.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateAgent()}
                className="rounded-lg bg-[#6ee7b7] px-5 py-2 text-sm font-semibold text-[#0a0b0f] hover:bg-[#5dd9a8] disabled:opacity-50"
              >
                {creating ? "Creazione…" : "Crea"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
