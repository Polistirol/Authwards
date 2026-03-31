import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { AgentStatus } from "../sdk";

import { IconCheck, IconClipboard } from "./icons";

type SnippetProviderMeta = {
  label: string;
  description: string;
  fileType: string;
  fileName: string;
  content: Record<string, unknown> | string;
  /** When true, only copy is offered (no download). */
  copyOnly?: boolean;
  /** cURL tab: pre-filled commands split for separate copy targets. */
  curlDetail?: { status: string; transact: string };
};

type SnippetApiResponse = {
  agentDid: string;
  agentName: string;
  platformUrl: string;
  agentToken: string;
  providers: Record<string, SnippetProviderMeta>;
};

type TabId = "n8n" | "python" | "zapier" | "arduino" | "javascript" | "curl";

type SnippetModalProps = {
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

function IconDownload({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

/** Plain text preview — no custom syntax highlighter (avoids heavy DOM / edge-case loops). */
function CodePreview({ code, className = "mt-3" }: { code: string; className?: string }) {
  return (
    <pre
      className={`max-h-72 overflow-auto rounded-lg border border-aw-border/90 bg-aw-inset p-3 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre ${className}`}
    >
      {code}
    </pre>
  );
}

function providerToRawString(p: SnippetProviderMeta): string {
  return typeof p.content === "string"
    ? p.content
    : JSON.stringify(p.content, null, 2);
}

function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TAB_ORDER: { id: TabId; label: string }[] = [
  { id: "n8n", label: "n8n" },
  { id: "python", label: "Python" },
  { id: "zapier", label: "Zapier" },
  { id: "arduino", label: "Arduino" },
  { id: "javascript", label: "JavaScript" },
  { id: "curl", label: "cURL" },
];

export default function SnippetModal({
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
  const [copyMain, setCopyMain] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setTab("n8n");
      setLoading(false);
      return;
    }
    if (!token) {
      setLoading(false);
      setData(null);
      setError(
        "Session unavailable (missing token). Sign in again, then reopen the snippet.",
      );
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `${trimSlash(backendUrl)}/agent/${encodeURIComponent(agentDid)}/snippet`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal,
          },
        );
        const json: unknown = await res.json();
        if (!res.ok) {
          const err =
            typeof json === "object" && json && "error" in json
              ? String((json as { error: unknown }).error)
              : res.statusText;
          setError(err);
          return;
        }
        setData(json as SnippetApiResponse);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [open, agentDid, backendUrl, token]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMain(key);
      setTimeout(() => setCopyMain(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const currentProvider = data?.providers?.[tab];

  const displayCode = useMemo(() => {
    if (!data || !currentProvider) return "";
    return providerToRawString(currentProvider);
  }, [data, currentProvider]);

  const downloadCode = useMemo(() => {
    if (!currentProvider) return "";
    return providerToRawString(currentProvider);
  }, [currentProvider]);

  const curlStatusDisplay = useMemo(() => {
    if (!currentProvider?.curlDetail) return "";
    return currentProvider.curlDetail.status;
  }, [currentProvider]);

  const curlTransactDisplay = useMemo(() => {
    if (!currentProvider?.curlDetail) return "";
    return currentProvider.curlDetail.transact;
  }, [currentProvider]);

  if (!open) return null;

  const pending =
    agentStatus === "pending_activation" || agentStatus === "created";

  const statusLabel =
    agentStatus === "active"
      ? "Active"
      : agentStatus === "revoked"
        ? "Revoked"
        : "Not activated";

  const handleDownload = () => {
    if (!data || !currentProvider) return;
    const mime =
      currentProvider.fileType === "json"
        ? "application/json"
        : currentProvider.fileType === "py"
          ? "text/x-python"
          : currentProvider.fileType === "sh"
            ? "text/x-shellscript"
            : currentProvider.fileType === "js"
              ? "text/javascript"
              : currentProvider.fileType === "ino" || currentProvider.fileType === "txt"
                ? "text/plain"
                : "text/plain";
    downloadText(currentProvider.fileName, downloadCode, mime);
  };

  const copyKey = `code-${tab}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[1px] pointer-events-auto"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="snippet-modal-title"
        className="welcome-modal-enter max-h-[min(92vh,900px)] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-aw-border/90 bg-aw-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-aw-border/50 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2
              id="snippet-modal-title"
              className="text-xl font-semibold text-white"
            >
              Workflow snippet
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-aw-border/80 px-3 py-1 text-sm text-slate-400 hover:bg-white/5"
            >
              Close
            </button>
          </div>

          {pending ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              This delegate is not yet activated. Activate it from the dashboard with
              &quot;Activate delegate&quot;; then connect your workflow using the files below.
            </div>
          ) : null}

          <div className="mt-4 space-y-3 rounded-xl border border-aw-border/80 bg-aw-surface/80 p-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Delegate DID</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-sm text-aw-accent">{agentDid}</code>
                <button
                  type="button"
                  onClick={() => void copyText("did", agentDid)}
                  className="text-xs text-aw-accent underline"
                >
                  {copyMain === "did" ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
            {data?.agentName ? (
              <div>
                <p className="text-xs uppercase text-slate-500">Delegate name</p>
                <p className="mt-1 text-sm font-medium text-white">{data.agentName}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase text-slate-500">Delegate token</p>
              <div className="relative mt-1 flex items-start gap-2">
                <div className="min-h-[1.5rem] min-w-0 flex-1 rounded-lg border border-aw-border/90 bg-aw-inset px-3 py-2">
                  {data?.agentToken ? (
                    <span className="break-all font-mono text-sm text-aw-text selection:bg-aw-accent/30">
                      {data.agentToken}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-300 hover:bg-white/10"
                  title={copyMain === "agent-token" ? "Copied" : "Copy delegate token"}
                  onClick={() => data?.agentToken && void copyText("agent-token", data.agentToken)}
                >
                  {copyMain === "agent-token" ? (
                    <IconCheck className="h-5 w-5 text-aw-accent" />
                  ) : (
                    <IconClipboard />
                  )}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Status</p>
              <p className="mt-1 text-sm font-medium text-white">{statusLabel}</p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-2">
          {loading ? (
            <p className="text-sm text-slate-400">Loading snippet…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : data && currentProvider ? (
            <>
              <div className="flex flex-wrap gap-2 border-b border-aw-border/50 pb-2">
                {TAB_ORDER.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      tab === id
                        ? "bg-aw-accent/15 text-aw-accent"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <h3 className="text-lg font-semibold text-white">
                  {currentProvider.label}
                </h3>
                {currentProvider.description ? (
                  <p className="mt-1 text-sm text-slate-400">
                    {currentProvider.description}
                  </p>
                ) : null}

                {tab === "arduino" ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                    <p className="font-medium">Hardware</p>
                    <p>
                      Requires ESP32 or ESP8266 with WiFi. Set{" "}
                      <code className="rounded bg-black/30 px-1">WIFI_SSID</code> and{" "}
                      <code className="rounded bg-black/30 px-1">WIFI_PASS</code> to your
                      credentials.
                    </p>
                    <p className="text-amber-100/90">
                      Required libraries: <strong>WiFi</strong>, <strong>HTTPClient</strong>,{" "}
                      <strong>ArduinoJson</strong>
                    </p>
                  </div>
                ) : null}

                {tab === "curl" && currentProvider.curlDetail && data ? (
                  <div className="relative mt-3 space-y-6">
                    <p className="font-mono text-sm break-all text-slate-300">
                      <span className="text-slate-500">BackendURL:</span>{" "}
                      {trimSlash(data.platformUrl)}
                    </p>
                    <div>
                      <p className="text-sm font-medium text-white">GET /bridge/status</p>
                      <CodePreview code={curlStatusDisplay} className="mt-2" />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            void copyText("curl-status", currentProvider.curlDetail!.status)
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
                          title={copyMain === "curl-status" ? "Copied" : "Copy"}
                        >
                          {copyMain === "curl-status" ? (
                            <IconCheck className="h-5 w-5 text-aw-accent" />
                          ) : (
                            <IconClipboard />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">POST /bridge/transact.</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Edit the transact <strong className="text-slate-300">to</strong> and{" "}
                        <strong className="text-slate-300">amount</strong> before sending.
                      </p>
                      <CodePreview code={curlTransactDisplay} className="mt-2" />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            void copyText("curl-transact", currentProvider.curlDetail!.transact)
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
                          title={copyMain === "curl-transact" ? "Copied" : "Copy"}
                        >
                          {copyMain === "curl-transact" ? (
                            <IconCheck className="h-5 w-5 text-aw-accent" />
                          ) : (
                            <IconClipboard />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative mt-3">
                    <CodePreview code={displayCode} className="mt-0" />
                    <div className="mt-2 flex justify-end gap-2">
                      {currentProvider.copyOnly ? null : (
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-aw-accent/40 bg-aw-accent/10 text-aw-accent hover:bg-aw-accent/20"
                          title="Download file"
                        >
                          <IconDownload />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void copyText(copyKey, downloadCode)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-aw-border/80 bg-white/5 text-slate-200 hover:bg-white/10"
                        title={copyMain === copyKey ? "Copied" : "Copy code"}
                      >
                        {copyMain === copyKey ? (
                          <IconCheck className="h-5 w-5 text-aw-accent" />
                        ) : (
                          <IconClipboard />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : data ? (
            <p className="text-sm text-amber-200">
              Snippet content unavailable. Ensure the backend exposes the &quot;providers&quot;
              field.
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
