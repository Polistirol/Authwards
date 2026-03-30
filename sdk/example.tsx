/**
 * Single-file example: AuthwardsProvider, login, DID / wallet display, create delegate agent.
 * Copy this folder into your app and import from `./index` (or configure path aliases).
 */
import { useState } from "react";

import {
  AuthwardsProvider,
  ConnectButton,
  useAuthwards,
  useAgent,
} from "./index";

const BACKEND_URL = "https://authwards-production.up.railway.app";

export function AuthwardSdkExampleApp() {
  return (
    <AuthwardsProvider backendUrl={BACKEND_URL} showWelcomeModal>
      <ExampleLayout />
    </AuthwardsProvider>
  );
}

function ExampleLayout() {
  const { user, did, walletAddress, isAuthenticated, loading } = useAuthwards();
  const { agents, loading: agentsLoading, createAgent } = useAgent();
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  async function handleCreateAgent(): Promise<void> {
    setCreateError(null);
    setLastCreated(null);
    const result = await createAgent({
      permissionProfile: "low_value",
      name: "Example Agent",
      description: "Created from sdk/example.tsx",
    });
    if (!result) {
      setCreateError("createAgent returned null (check console and auth).");
      return;
    }
    setLastCreated(result.agentDid);
  }

  if (loading) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <p>Loading session…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
        color: "#e2e8f0",
        background: "#0c1220",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Authward SDK example</h1>
        <ConnectButton label="Connect" size="md" theme="dark" />
      </header>

      {!isAuthenticated ? (
        <p style={{ color: "#94a3b8" }}>Use Connect to sign in with OAuth or wallet.</p>
      ) : (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Session</h2>
            <p>
              <strong>Name:</strong> {user?.name}
            </p>
            <p style={{ wordBreak: "break-all" }}>
              <strong>DID:</strong> {did}
            </p>
            <p style={{ wordBreak: "break-all" }}>
              <strong>Wallet:</strong> {walletAddress ?? "—"}
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 16 }}>Delegated identities</h2>
            <button
              type="button"
              onClick={() => void handleCreateAgent()}
              style={{
                marginBottom: 16,
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "#f59e0b",
                color: "#0c1220",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create example agent (low_value)
            </button>
            {createError ? (
              <p style={{ color: "#f87171" }}>{createError}</p>
            ) : null}
            {lastCreated ? (
              <p style={{ color: "#86efac" }}>Last created agent DID: {lastCreated}</p>
            ) : null}
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              Agents loading: {agentsLoading ? "yes" : "no"} — count: {agents.length}
            </p>
            <ul style={{ paddingLeft: 20 }}>
              {agents.map((a) => (
                <li key={a.agentDid} style={{ marginBottom: 8 }}>
                  <code style={{ fontSize: 12 }}>{a.name ?? a.agentDid}</code> —{" "}
                  {a.permissionProfile} ({a.status ?? "unknown"})
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
