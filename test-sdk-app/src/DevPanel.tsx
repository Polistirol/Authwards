import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { Agent } from "../../sdk";
import { ConnectButton, useAgent, useAuthwards } from "../../sdk";

function readSessionJwt(): string | null {
  try {
    return (
      sessionStorage.getItem("authwards:jwt") ?? sessionStorage.getItem("iota-auth:jwt")
    );
  } catch {
    return null;
  }
}

const C = {
  bg: "#0f1117",
  panel: "#161922",
  pre: "#1a1d28",
  border: "#2a2f3d",
  text: "#e2e8f0",
  muted: "#94a3b8",
  ok: "#4ade80",
  warn: "#facc15",
  err: "#f87171",
  info: "#60a5fa",
  readonly: "#94a3b8",
};

type LogKind = "info" | "success" | "error";

type ConsoleLine = {
  id: number;
  ts: string;
  kind: LogKind;
  message: string;
};

type RawRoute = "GET /auth/me" | "GET /agent/list" | "GET /did/resolve/:did";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function truncateDid(did: string, head = 14, tail = 8): string {
  if (did.length <= head + tail + 3) return did;
  return `${did.slice(0, head)}…${did.slice(-tail)}`;
}

function profileColor(profile: string): string {
  if (profile === "readonly") return C.readonly;
  if (profile === "low_value") return C.warn;
  if (profile === "full_access") return C.ok;
  return C.muted;
}

function SectionShell(props: {
  title: string;
  accent: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): ReactElement {
  const { title, accent, open, onToggle, children } = props;
  return (
    <section
      style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 0 16px",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "block",
          width: "100%",
          textAlign: "left",
          paddingLeft: 12,
          borderLeft: `4px solid ${accent}`,
          marginBottom: open ? 12 : 0,
          fontWeight: 700,
          fontSize: 14,
          color: C.text,
        }}
      >
        {open ? "▼" : "▶"} {title}
      </button>
      {open ? children : null}
    </section>
  );
}

function IntegrationSnippet(): ReactElement {
  const kw = { color: "#c084fc" };
  const str = { color: C.ok };
  const cmt = { color: C.muted };
  const fn = { color: C.info };
  const punct = { color: "#a1a1aa" };
  return (
    <pre
      style={{
        background: C.pre,
        padding: 14,
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.5,
        border: `1px solid ${C.border}`,
      }}
    >
      <span style={cmt}>// 1. Wrap your app</span>
      {"\n"}
      <span style={punct}>&lt;</span>
      <span style={kw}>AuthwardsProvider</span> <span style={fn}>backendUrl</span>
      <span style={punct}>=</span>
      <span style={str}>&quot;http://localhost:3000&quot;</span>
      <span style={punct}>&gt;</span>
      {"\n"}
      <span style={punct}>&lt;</span>
      <span style={kw}>App</span> <span style={punct}>/&gt;</span>
      {"\n"}
      <span style={punct}>&lt;/</span>
      <span style={kw}>AuthwardsProvider</span>
      <span style={punct}>&gt;</span>
      {"\n"}
      <span style={cmt}>// 2. Use the hooks</span>
      {"\n"}
      <span style={kw}>const</span> {"{ "}
      <span style={fn}>user</span>, <span style={fn}>did</span>, <span style={fn}>isAuthenticated</span>,{" "}
      <span style={fn}>login</span>, <span style={fn}>logout</span>
      {" } "} <span style={punct}>=</span> <span style={fn}>useAuthwards</span>
      <span style={punct}>()</span>
      {"\n"}
      <span style={kw}>const</span> {"{ "}
      <span style={fn}>agents</span>, <span style={fn}>createAgent</span>
      {" } "} <span style={punct}>=</span> <span style={fn}>useAgent</span>
      <span style={punct}>()</span>
      {"\n"}
      <span style={cmt}>// 3. That&apos;s it</span>
      {"\n"}
      <span style={kw}>if</span> <span style={punct}>(!</span>
      <span style={fn}>isAuthenticated</span>
      <span style={punct}>)</span> <span style={fn}>login</span>
      <span style={punct}>()</span>
      {"\n"}
      <span style={fn}>console</span>
      <span style={punct}>.</span>
      <span style={fn}>log</span>
      <span style={punct}>(</span>
      <span style={str}>&apos;DID:&apos;</span>
      <span style={punct}>,</span> <span style={fn}>did</span>
      <span style={punct}>)</span>
    </pre>
  );
}

export type DevPanelProps = {
  backendUrl: string;
};

export default function DevPanel({ backendUrl }: DevPanelProps): ReactElement {
  const base = useMemo(() => trimTrailingSlash(backendUrl), [backendUrl]);

  const { user, isAuthenticated, loading, login, logout } = useAuthwards();
  const { agents, loading: agentsLoading, createAgent, agentLogs, fetchAgentLogs } =
    useAgent();

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [sections, setSections] = useState<Record<string, boolean>>({
    status: true,
    auth: true,
    agents: true,
    integration: true,
    raw: true,
    console: true,
  });

  const [rawRoute, setRawRoute] = useState<RawRoute>("GET /auth/me");
  const [rawParam, setRawParam] = useState("");
  const [rawLoading, setRawLoading] = useState(false);
  const [rawBody, setRawBody] = useState<string>("");

  const logId = useRef(0);
  const [lines, setLines] = useState<ConsoleLine[]>([]);

  const pushLog = useCallback((kind: LogKind, message: string) => {
    const id = ++logId.current;
    const ts = new Date().toISOString();
    setLines((prev) => {
      const next = [...prev, { id, ts, kind, message }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    const prefix = `[${ts}]`;
    if (kind === "error") console.error(prefix, message);
    else if (kind === "success") console.log(prefix, message);
    else console.log(prefix, message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/auth/me`, { method: "GET" });
        if (cancelled) return;
        if (res.status === 200) {
          setBackendOk(true);
          return;
        }
        if (res.status === 401) {
          setBackendOk(true);
          return;
        }
        setBackendOk(false);
        pushLog("error", `GET /auth/me returned ${res.status}`);
      } catch (e) {
        if (cancelled) return;
        setBackendOk(false);
        const msg = e instanceof Error ? e.message : String(e);
        pushLog("error", `Backend probe failed: ${msg}`);
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, pushLog]);

  useEffect(() => {
    if (!isAuthenticated || agents.length === 0) return;
    (async () => {
      try {
        for (const a of agents) {
          await fetchAgentLogs(a.agentDid);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushLog("error", `fetchAgentLogs error: ${msg}`);
        console.error(e);
      }
    })();
  }, [isAuthenticated, agents, fetchAgentLogs, pushLog]);

  const toggle = (key: string) => {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  };

  const handleLogin = () => {
    try {
      pushLog("info", "useAuthwards().login() — apre il modal (OAuth / wallet / Telegram)");
      login();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog("error", `login() error: ${msg}`);
      console.error(e);
    }
  };

  const handleLogout = () => {
    try {
      logout();
      pushLog("success", "useAuthwards().logout() — session cleared");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog("error", `logout() error: ${msg}`);
      console.error(e);
    }
  };

  const handleCreate = async (profile: string) => {
    try {
      pushLog("info", `createAgent({ permissionProfile: '${profile}', … }) …`);
      await createAgent({
        permissionProfile: profile,
        name: `Dev agent ${new Date().toISOString().slice(0, 19)}`,
        description: "Creato da test-sdk-app DevPanel",
      });
      pushLog("success", `createAgent('${profile}') completed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog("error", `createAgent('${profile}') error: ${msg}`);
      console.error(e);
    }
  };

  const copyDid = async (full: string) => {
    try {
      await navigator.clipboard.writeText(full);
      pushLog("success", "DID copied to clipboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog("error", `copy failed: ${msg}`);
      console.error(e);
    }
  };

  const sendRaw = async () => {
    setRawLoading(true);
    setRawBody("");
    try {
      let jwt: string | null = null;
      try {
        jwt = readSessionJwt();
      } catch (e) {
        console.error(e);
      }

      let url = "";
      if (rawRoute === "GET /auth/me") {
        url = `${base}/auth/me`;
      } else if (rawRoute === "GET /agent/list") {
        url = `${base}/agent/list`;
      } else {
        const did = rawParam.trim();
        if (!did) {
          pushLog("error", "Raw API: DID parameter required for /did/resolve/:did");
          setRawBody(JSON.stringify({ error: "Missing DID in parameter field" }, null, 2));
          return;
        }
        url = `${base}/did/resolve/${encodeURIComponent(did)}`;
      }

      const headers: Record<string, string> = {};
      if (jwt) headers.Authorization = `Bearer ${jwt}`;

      pushLog("info", `Raw fetch: ${rawRoute} → ${url}`);

      const res = await fetch(url, { headers });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw text */
      }
      setRawBody(`${res.status} ${res.statusText}\n\n${pretty}`);
      if (res.ok) pushLog("success", `Raw API ${res.status}`);
      else pushLog("error", `Raw API ${res.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRawBody(msg);
      pushLog("error", `Raw API error: ${msg}`);
      console.error(e);
    } finally {
      setRawLoading(false);
    }
  };

  const headerDot = backendOk === null ? C.warn : backendOk ? C.ok : C.err;
  const headerLabel =
    backendOk === null ? "checking…" : backendOk ? "connected" : "unreachable";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: C.panel,
          borderBottom: `1px solid ${C.border}`,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            title={headerLabel}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: headerDot,
              flexShrink: 0,
            }}
          />
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Authwards SDK — Test Console</h1>
        </div>
        <ConnectButton
          theme="dark"
          label="Connect"
          onConnect={(u) => pushLog("success", `ConnectButton onConnect — ${u.did}`)}
          onDisconnect={() => pushLog("info", "ConnectButton onDisconnect")}
        />
      </header>

      <main
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "16px 20px 120px",
        }}
      >
        <SectionShell
          title="SDK Status"
          accent={C.info}
          open={sections.status}
          onToggle={() => toggle("status")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <span style={{ color: C.muted }}>Backend: </span>
              {backendOk === null && <span style={{ color: C.warn }}>checking…</span>}
              {backendOk === true && <span style={{ color: C.ok }}>connected</span>}
              {backendOk === false && <span style={{ color: C.err }}>unreachable</span>}
            </div>
            <div>
              <span style={{ color: C.muted }}>Authenticated: </span>
              {loading ? (
                <span style={{ color: C.warn }}>loading…</span>
              ) : (
                <span style={{ color: isAuthenticated ? C.ok : C.err }}>{String(isAuthenticated)}</span>
              )}
            </div>
            {isAuthenticated && user && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div>
                  <span style={{ color: C.muted }}>Name: </span>
                  {user.name}
                </div>
                <div>
                  <span style={{ color: C.muted }}>Email: </span>
                  {user.email ?? "—"}
                </div>
                <div>
                  <span style={{ color: C.muted }}>DID: </span>
                  <button
                    type="button"
                    onClick={() => void copyDid(user.did)}
                    title="Click to copy full DID"
                    style={{
                      background: "none",
                      border: "none",
                      color: C.info,
                      padding: 0,
                      textDecoration: "underline",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    {truncateDid(user.did)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionShell>

        <SectionShell
          title="Auth Flow"
          accent={C.ok}
          open={sections.auth}
          onToggle={() => toggle("auth")}
        >
          {!isAuthenticated && !loading && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={handleLogin}
                style={{
                  padding: "8px 12px",
                  background: C.pre,
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  borderRadius: 4,
                }}
              >
                login()
              </button>
            </div>
          )}
          {loading && <div style={{ color: C.warn }}>Auth bootstrap…</div>}
          {isAuthenticated && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  padding: "8px 12px",
                  background: C.pre,
                  border: `1px solid ${C.border}`,
                  color: C.err,
                  borderRadius: 4,
                  alignSelf: "flex-start",
                }}
              >
                useAuthwards().logout()
              </button>
              <div>
                <div style={{ color: C.muted, marginBottom: 6 }}>user object (from useAuthwards)</div>
                <pre
                  style={{
                    background: C.pre,
                    padding: 12,
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    fontSize: 11,
                    maxHeight: 280,
                  }}
                >
                  {JSON.stringify(user, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SectionShell>

        <SectionShell
          title="Agent Management"
          accent={C.warn}
          open={sections.agents}
          onToggle={() => toggle("agents")}
        >
          {!isAuthenticated && (
            <div style={{ color: C.warn, padding: "8px 0" }}>Login required</div>
          )}
          {isAuthenticated && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => void handleCreate("readonly")}
                  style={{
                    padding: "8px 10px",
                    background: C.pre,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  createAgent(&apos;readonly&apos;)
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate("low_value")}
                  style={{
                    padding: "8px 10px",
                    background: C.pre,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  createAgent(&apos;low_value&apos;)
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate("full_access")}
                  style={{
                    padding: "8px 10px",
                    background: C.pre,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  createAgent(&apos;full_access&apos;)
                </button>
              </div>
              {agentsLoading && <div style={{ color: C.warn }}>Loading agents…</div>}
              {!agentsLoading && agents.length === 0 && (
                <div style={{ color: C.muted }}>No agents yet. Create one above.</div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                {agents.map((a: Agent) => {
                  const logs = agentLogs.get(a.agentDid) ?? [];
                  const last5 = logs.slice(-5);
                  return (
                    <li
                      key={a.agentDid}
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        padding: 12,
                        marginBottom: 10,
                        background: C.pre,
                      }}
                    >
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: C.muted }}>agentDid: </span>
                        <span style={{ color: C.info }}>{truncateDid(a.agentDid)}</span>
                      </div>
                      <div>
                        <span style={{ color: C.muted }}>permissionProfile: </span>
                        <span style={{ color: profileColor(a.permissionProfile), fontWeight: 600 }}>
                          {a.permissionProfile}
                        </span>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <span style={{ color: C.muted, fontSize: 11 }}>Last 5 logs</span>
                        {last5.length === 0 ? (
                          <div style={{ color: C.muted, marginTop: 4 }}>(none yet)</div>
                        ) : (
                          <pre
                            style={{
                              marginTop: 6,
                              fontSize: 11,
                              background: C.bg,
                              padding: 8,
                              borderRadius: 4,
                              maxHeight: 160,
                            }}
                          >
                            {JSON.stringify(last5, null, 2)}
                          </pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </SectionShell>

        <SectionShell
          title="Integration Code"
          accent={C.info}
          open={sections.integration}
          onToggle={() => toggle("integration")}
        >
          <IntegrationSnippet />
        </SectionShell>

        <SectionShell
          title="Raw API Calls"
          accent="#64748b"
          open={sections.raw}
          onToggle={() => toggle("raw")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ color: C.muted }}>Route</span>
              <select
                value={rawRoute}
                onChange={(e) => setRawRoute(e.target.value as RawRoute)}
                style={{
                  background: C.pre,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  padding: 8,
                  borderRadius: 4,
                  fontFamily: "inherit",
                }}
              >
                <option value="GET /auth/me">GET /auth/me</option>
                <option value="GET /agent/list">GET /agent/list</option>
                <option value="GET /did/resolve/:did">GET /did/resolve/:did</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ color: C.muted }}>Parameter (DID for resolve)</span>
              <input
                value={rawParam}
                onChange={(e) => setRawParam(e.target.value)}
                placeholder="did:iota:…"
                style={{
                  background: C.pre,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  padding: 8,
                  borderRadius: 4,
                  fontFamily: "inherit",
                }}
              />
            </label>
            <button
              type="button"
              disabled={rawLoading}
              onClick={() => void sendRaw()}
              style={{
                padding: "8px 14px",
                background: C.info,
                border: "none",
                color: "#0f1117",
                fontWeight: 700,
                borderRadius: 4,
                alignSelf: "flex-start",
                opacity: rawLoading ? 0.6 : 1,
              }}
            >
              Send
            </button>
            {rawBody && (
              <pre
                style={{
                  background: C.pre,
                  padding: 12,
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  fontSize: 11,
                  maxHeight: 320,
                }}
              >
                {rawBody}
              </pre>
            )}
          </div>
        </SectionShell>

        <SectionShell
          title="Console log"
          accent={C.muted}
          open={sections.console}
          onToggle={() => toggle("console")}
        >
          <div
            style={{
              background: C.pre,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              maxHeight: 220,
              overflow: "auto",
              padding: 8,
            }}
          >
            {lines.length === 0 ? (
              <span style={{ color: C.muted }}>(empty)</span>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  style={{
                    fontSize: 11,
                    marginBottom: 4,
                    color: l.kind === "error" ? C.err : l.kind === "success" ? C.ok : C.text,
                  }}
                >
                  <span style={{ color: C.muted }}>{l.ts}</span> [{l.kind}] {l.message}
                </div>
              ))
            )}
          </div>
        </SectionShell>
      </main>

    </div>
  );
}
