import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentStatus } from "../../../sdk";

type SnippetBundle = {
  n8n: {
    label: string;
    description: string;
    steps: string[];
    checkCommand: string;
    executeCommand: string;
  };
  curl: {
    label: string;
    description: string;
    check: string;
    execute: string;
  };
  javascript: {
    label: string;
    description: string;
    code: string;
  };
};

type SnippetApiResponse = {
  agentDid: string;
  platformUrl: string;
  agentToken: string;
  snippets: SnippetBundle;
};

type TabId = "n8n" | "curl" | "javascript";

export type SnippetModalProps = {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  agentStatus: AgentStatus;
  backendUrl: string;
  token: string | null;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function MaskedToken({ token, revealed }: { token: string; revealed: boolean }) {
  const masked = useMemo(() => "•".repeat(Math.max(token.length, 8)), [token.length]);
  return (
    <span className="relative flex min-h-[1.25rem] break-all font-mono text-sm">
      <span
        className={`recovery-phrase-crossfade ${
          revealed ? "pointer-events-none absolute inset-0 opacity-0" : "relative opacity-100"
        }`}
      >
        {masked}
      </span>
      <span
        className={`recovery-phrase-crossfade text-slate-100 selection:bg-amber-500/30 ${
          revealed ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"
        }`}
      >
        {token}
      </span>
    </span>
  );
}

function CodeBlock({
  label,
  code,
  onCopy,
  copied,
}: {
  label: string;
  code: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-slate-600 bg-white/5 px-2 py-1 text-xs text-amber-400 hover:bg-white/10"
        >
          {copied ? "Copiato ✓" : "Copia"}
        </button>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-600 bg-[#0a0f1a] p-3 font-mono text-xs leading-relaxed text-slate-200">
        {code}
      </pre>
    </div>
  );
}

export function SnippetModal({
  open,
  onClose,
  agentDid,
  agentStatus,
  backendUrl,
  token,
}: SnippetModalProps) {
  const [tab, setTab] = useState<TabId>("n8n");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SnippetApiResponse | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [copyMain, setCopyMain] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setTokenRevealed(false);
      setTab("n8n");
      return;
    }
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `${trimSlash(backendUrl)}/agent/${encodeURIComponent(agentDid)}/snippet`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json: unknown = await res.json();
        if (!res.ok) {
          const err =
            typeof json === "object" && json && "error" in json
              ? String((json as { error: unknown }).error)
              : res.statusText;
          if (!cancelled) setError(err);
          return;
        }
        if (!cancelled) setData(json as SnippetApiResponse);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Errore di rete");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, agentDid, backendUrl, token]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMain(key);
      setTimeout(() => setCopyMain(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  if (!open) return null;

  const pending =
    agentStatus === "pending_activation" || agentStatus === "created";

  const statusLabel =
    agentStatus === "active"
      ? "Attivo"
      : agentStatus === "revoked"
        ? "Revocato"
        : "Non attivato";

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[1px]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="snippet-modal-title"
        className="tf-modal-enter max-h-[min(92vh,900px)] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-slate-600 bg-[#131a2a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-600 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="snippet-modal-title" className="text-xl font-semibold text-white">
              Snippet workflow
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-400 hover:bg-white/5"
            >
              Chiudi
            </button>
          </div>

          {pending ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Questo agente non è ancora attivo. Attivalo dalla dashboard (bottone «Attiva Agente»);
              poi collega n8n con gli URL sotto.
            </div>
          ) : null}

          <div className="mt-4 space-y-3 rounded-xl border border-slate-600 bg-[#1e293b] p-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Agent DID</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-sm text-amber-400">{agentDid}</code>
                <button
                  type="button"
                  onClick={() => void copyText("did", agentDid)}
                  className="text-xs text-amber-400 underline"
                >
                  {copyMain === "did" ? "Copiato ✓" : "Copia"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Agent token</p>
              <div className="relative mt-1 flex items-start gap-2">
                <div className="min-h-[1.5rem] min-w-0 flex-1 rounded-lg border border-slate-600 bg-[#0a0f1a] px-3 py-2">
                  {data?.agentToken ? (
                    <MaskedToken token={data.agentToken} revealed={tokenRevealed} />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>
                <button
                  type="button"
                  className="h-10 w-10 shrink-0 rounded-lg border border-slate-600 bg-white/5 text-lg hover:bg-white/10"
                  title={tokenRevealed ? "Nascondi" : "Mostra"}
                  onClick={() => setTokenRevealed((v) => !v)}
                >
                  👁
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Stato</p>
              <p className="mt-1 text-sm font-medium text-white">{statusLabel}</p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-2">
          {loading ? (
            <p className="text-sm text-slate-400">Caricamento snippet…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : data ? (
            <>
              <div className="flex gap-2 border-b border-slate-600 pb-2">
                {(
                  [
                    ["n8n", "n8n"],
                    ["curl", "cURL"],
                    ["javascript", "JavaScript"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      tab === id
                        ? "bg-amber-500/15 text-amber-400"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "n8n" ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-white">{data.snippets.n8n.label}</h3>
                  <p className="mt-1 text-sm text-slate-400">{data.snippets.n8n.description}</p>
                  <pre className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-600 bg-[#0a0f1a] p-4 font-mono text-xs leading-relaxed text-slate-200">
                    {data.snippets.n8n.steps.join("\n")}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void copyText("n8n-steps", data.snippets.n8n.steps.join("\n"))}
                    className="mt-2 text-sm text-amber-400 underline"
                  >
                    {copyMain === "n8n-steps" ? "Copiato ✓" : "Copia istruzioni"}
                  </button>
                  <CodeBlock
                    label="Check"
                    code={data.snippets.n8n.checkCommand}
                    copied={copyMain === "n8n-check"}
                    onCopy={() => void copyText("n8n-check", data.snippets.n8n.checkCommand)}
                  />
                  <CodeBlock
                    label="Execute"
                    code={data.snippets.n8n.executeCommand}
                    copied={copyMain === "n8n-exec"}
                    onCopy={() => void copyText("n8n-exec", data.snippets.n8n.executeCommand)}
                  />
                </div>
              ) : null}

              {tab === "curl" ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-white">{data.snippets.curl.label}</h3>
                  <p className="mt-1 text-sm text-slate-400">{data.snippets.curl.description}</p>
                  <CodeBlock
                    label="check"
                    code={data.snippets.curl.check}
                    copied={copyMain === "curl-c"}
                    onCopy={() => void copyText("curl-c", data.snippets.curl.check)}
                  />
                  <CodeBlock
                    label="execute"
                    code={data.snippets.curl.execute}
                    copied={copyMain === "curl-e"}
                    onCopy={() => void copyText("curl-e", data.snippets.curl.execute)}
                  />
                </div>
              ) : null}

              {tab === "javascript" ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-white">
                    {data.snippets.javascript.label}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {data.snippets.javascript.description}
                  </p>
                  <CodeBlock
                    label="Codice"
                    code={data.snippets.javascript.code}
                    copied={copyMain === "js"}
                    onCopy={() => void copyText("js", data.snippets.javascript.code)}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
