import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { AgentStatus } from "../../../sdk";

type SnippetProviderMeta = {
  label: string;
  description: string;
  fileType: string;
  fileName: string;
  content: Record<string, unknown> | string;
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

function IconEye({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function IconEyeOff({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
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

function IconClipboard({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function IconCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function MaskedToken({
  token,
  revealed,
}: {
  token: string;
  revealed: boolean;
}) {
  const masked = useMemo(
    () => "•".repeat(Math.max(token.length, 8)),
    [token.length],
  );
  return (
    <span className="relative flex min-h-[1.25rem] font-mono text-sm break-all">
      <span
        className={`recovery-phrase-crossfade ${
          revealed ? "pointer-events-none absolute inset-0 opacity-0" : "relative opacity-100"
        }`}
      >
        {masked}
      </span>
      <span
        className={`recovery-phrase-crossfade text-slate-800 selection:bg-sky-200/60 ${
          revealed ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"
        }`}
      >
        {token}
      </span>
    </span>
  );
}

function CodePreview({ code, className = "mt-3" }: { code: string; className?: string }) {
  return (
    <pre
      className={`max-h-72 overflow-auto rounded-lg border border-sky-200 bg-sky-50 p-3 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre ${className}`}
    >
      {code}
    </pre>
  );
}

function maskTokenInText(text: string, token: string, revealed: boolean): string {
  if (revealed || !token) return text;
  const mask = "•".repeat(Math.max(token.length, 8));
  return text.split(token).join(mask);
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
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [copyMain, setCopyMain] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setTokenRevealed(false);
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
    const raw = providerToRawString(currentProvider);
    return maskTokenInText(raw, data.agentToken, tokenRevealed);
  }, [data, currentProvider, tokenRevealed]);

  const downloadCode = useMemo(() => {
    if (!currentProvider) return "";
    return providerToRawString(currentProvider);
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
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] pointer-events-auto"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="snippet-modal-title"
        className="welcome-modal-enter max-h-[min(92vh,900px)] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-sky-200 bg-white shadow-xl shadow-sky-200/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-sky-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2
              id="snippet-modal-title"
              className="text-xl font-semibold text-sky-950"
            >
              Snippet workflow
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-sky-200 px-3 py-1 text-sm text-sky-800 hover:bg-sky-50"
            >
              Close
            </button>
          </div>

          {pending ? (
            <div className="mt-4 rounded-lg border border-sky-300 bg-sky-100 px-4 py-3 text-sm text-sky-950">
              This agent is not active yet. Activate it from the dashboard with the
              &quot;Activate Agent&quot; button; then connect the workflow using the files below.
            </div>
          ) : null}

          <div className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4">
            <div>
              <p className="text-xs uppercase text-sky-600/80">Agent DID</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-sm text-sky-800">{agentDid}</code>
                <button
                  type="button"
                  onClick={() => void copyText("did", agentDid)}
                  className="text-xs font-medium text-sky-600 underline hover:text-sky-900"
                >
                  {copyMain === "did" ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
            {data?.agentName ? (
              <div>
                <p className="text-xs uppercase text-sky-600/80">Agent name</p>
                <p className="mt-1 text-sm font-medium text-sky-950">{data.agentName}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase text-sky-600/80">Agent token</p>
              <div className="relative mt-1 flex items-start gap-2">
                <div className="min-h-[1.5rem] min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2">
                  {data?.agentToken ? (
                    <MaskedToken
                      token={data.agentToken}
                      revealed={tokenRevealed}
                    />
                  ) : (
                    <span className="text-sky-600/70">—</span>
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                  title={tokenRevealed ? "Hide token" : "Show token"}
                  onClick={() => setTokenRevealed((v) => !v)}
                >
                  {tokenRevealed ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-sky-700/75">
                The token is masked in the preview. Downloading or copying from the block below includes the
                real token.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-sky-600/80">Status</p>
              <p className="mt-1 text-sm font-medium text-sky-950">{statusLabel}</p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-2">
          {loading ? (
            <p className="text-sm text-sky-700/80">Loading snippet…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : data && currentProvider ? (
            <>
              <div className="flex flex-wrap gap-2 border-b border-sky-200 pb-2">
                {TAB_ORDER.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      tab === id
                        ? "bg-sky-200 text-sky-950"
                        : "text-sky-700/80 hover:bg-sky-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <h3 className="text-lg font-semibold text-sky-950">
                  {currentProvider.label}
                </h3>
                <p className="mt-1 text-sm text-sky-800/85">
                  {currentProvider.description}
                </p>

                {tab === "arduino" ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                    <p className="font-medium">Hardware</p>
                    <p>
                      Requires ESP32 or ESP8266 with WiFi. Set{" "}
                      <code className="rounded bg-sky-200/80 px-1">WIFI_SSID</code> and{" "}
                      <code className="rounded bg-sky-200/80 px-1">WIFI_PASS</code> to your network
                      credentials.
                    </p>
                    <p className="text-sky-900/90">
                      Librerie: <strong>WiFi</strong>, <strong>HTTPClient</strong>,{" "}
                      <strong>ArduinoJson</strong>
                    </p>
                  </div>
                ) : null}

                <div className="relative mt-3">
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                      title={tokenRevealed ? "Hide token in code" : "Show token in code"}
                      onClick={() => setTokenRevealed((v) => !v)}
                    >
                      {tokenRevealed ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                  <CodePreview code={displayCode} className="mt-0" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200/80"
                      title="Download file"
                    >
                      <IconDownload />
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(copyKey, downloadCode)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-800 hover:bg-sky-50"
                      title={copyMain === copyKey ? "Copied" : "Copy to clipboard"}
                    >
                      {copyMain === copyKey ? (
                        <IconCheck className="h-5 w-5 text-sky-600" />
                      ) : (
                        <IconClipboard />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : data ? (
            <p className="text-sm text-sky-800/90">
              Snippet content unavailable. Ensure the backend exposes the &quot;providers&quot; field.
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
