import { useCallback, useContext, useEffect, useState } from "react";

import { normalizeAgentLogList } from "./agentLogUtils";
import { IotaAuthContext } from "./IotaAuthProvider";
import type { Agent, AgentLog } from "./types";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type CreateAgentResult = {
  agentDid: string;
  walletAddress: string;
  agentToken: string;
  permissionProfile: string;
  status: string;
  name: string;
  description: string;
};

export type CreateAgentInput = {
  permissionProfile: string;
  name: string;
  description: string;
};

export type UseAgentResult = {
  agents: Agent[];
  loading: boolean;
  /** Ricarica la lista (es. dopo revoke). */
  refreshAgents: () => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<CreateAgentResult | null>;
  agentLogs: Map<string, AgentLog[]>;
  /** Carica log statici da GET /agent/logs/:agentDid (nessun WebSocket). */
  fetchAgentLogs: (agentDid: string) => Promise<void>;
  revokeAgent: (agentDid: string) => Promise<boolean>;
};

export function useAgent(): UseAgentResult {
  const ctx = useContext(IotaAuthContext);
  if (!ctx) {
    throw new Error("useAgent must be used within IotaAuthProvider");
  }

  const { backendUrl, token } = ctx;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentLogs, setAgentLogs] = useState<Map<string, AgentLog[]>>(new Map());

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadAgents = useCallback(
    async (silent = false): Promise<void> => {
      if (!token) {
        setAgents([]);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/agent/list`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          console.error("[@iota-auth/sdk] GET /agent/list failed:", res.status, await res.text());
          setAgents([]);
          return;
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          setAgents([]);
          return;
        }
        setAgents(data as Agent[]);
      } catch (e) {
        console.error("[@iota-auth/sdk] GET /agent/list error:", e);
        setAgents([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [backendUrl, token, authHeaders],
  );

  const refreshAgents = useCallback(async (): Promise<void> => {
    await loadAgents(true);
  }, [loadAgents]);

  useEffect(() => {
    void loadAgents(false);
  }, [loadAgents]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      void loadAgents(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [token, loadAgents]);

  const setLogsReplace = useCallback((agentDid: string, logs: AgentLog[]): void => {
    setAgentLogs((prev) => {
      const next = new Map(prev);
      next.set(agentDid, logs);
      return next;
    });
  }, []);

  const fetchAgentLogs = useCallback(
    async (agentDid: string): Promise<void> => {
      if (!token) return;
      try {
        const res = await fetch(
          `${trimTrailingSlash(backendUrl)}/agent/logs/${encodeURIComponent(agentDid)}`,
          { headers: authHeaders() },
        );
        if (!res.ok) {
          console.error("[@iota-auth/sdk] GET /agent/logs failed:", res.status, await res.text());
          return;
        }
        const raw: unknown = await res.json();
        const normalized = normalizeAgentLogList(raw);
        setLogsReplace(agentDid, normalized);
      } catch (e) {
        console.error("[@iota-auth/sdk] GET /agent/logs error:", e);
      }
    },
    [backendUrl, token, authHeaders, setLogsReplace],
  );

  const createAgent = useCallback(
    async (input: CreateAgentInput): Promise<CreateAgentResult | null> => {
      if (!token) {
        console.error("[@iota-auth/sdk] createAgent: not authenticated");
        return null;
      }
      try {
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/agent/create`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            permissionProfile: input.permissionProfile,
            name: input.name.trim(),
            description: input.description.trim(),
          }),
        });
        if (!res.ok) {
          console.error("[@iota-auth/sdk] POST /agent/create failed:", res.status, await res.text());
          return null;
        }
        const json = (await res.json()) as CreateAgentResult;
        await loadAgents(true);
        return json;
      } catch (e) {
        console.error("[@iota-auth/sdk] POST /agent/create error:", e);
        return null;
      }
    },
    [backendUrl, token, authHeaders, loadAgents],
  );

  const revokeAgent = useCallback(
    async (agentDid: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/bridge/revoke`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ agentDid }),
        });
        if (!res.ok) {
          console.error("[@iota-auth/sdk] POST /bridge/revoke failed:", res.status, await res.text());
          return false;
        }
        await loadAgents(true);
        return true;
      } catch (e) {
        console.error("[@iota-auth/sdk] POST /bridge/revoke error:", e);
        return false;
      }
    },
    [backendUrl, token, authHeaders, loadAgents],
  );

  return {
    agents,
    loading,
    refreshAgents,
    createAgent,
    agentLogs,
    fetchAgentLogs,
    revokeAgent,
  };
}
