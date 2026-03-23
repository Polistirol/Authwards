import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { normalizeAgentLog, normalizeAgentLogList } from "./agentLogUtils";
import { IotaAuthContext } from "./IotaAuthProvider";
import type { Agent, AgentLog } from "./types";

const WS_URL = "ws://localhost:8080";
const POLL_MS = 3000;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type UseAgentResult = {
  agents: Agent[];
  loading: boolean;
  createAgent: (profile: string) => Promise<void>;
  agentLogs: Map<string, AgentLog[]>;
  connectLogs: (agentDid: string) => void;
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

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTargetRef = useRef<string | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadAgents = useCallback(async (): Promise<void> => {
    if (!token) {
      setAgents([]);
      return;
    }
    setLoading(true);
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
      setLoading(false);
    }
  }, [backendUrl, token, authHeaders]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const mergeLogsForAgent = useCallback((agentDid: string, incoming: AgentLog[]): void => {
    setAgentLogs((prev) => {
      const next = new Map(prev);
      const existing = next.get(agentDid) ?? [];
      const seen = new Set(existing.map((l) => `${l.timestamp}\0${l.type}\0${JSON.stringify(l.data)}`));
      const merged = [...existing];
      for (const log of incoming) {
        const key = `${log.timestamp}\0${log.type}\0${JSON.stringify(log.data)}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(log);
        }
      }
      merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      next.set(agentDid, merged);
      return next;
    });
  }, []);

  const setLogsReplace = useCallback((agentDid: string, logs: AgentLog[]): void => {
    setAgentLogs((prev) => {
      const next = new Map(prev);
      next.set(agentDid, logs);
      return next;
    });
  }, []);

  const fetchLogsOnce = useCallback(
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

  const stopLogTransport = useCallback((): void => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const connectLogs = useCallback(
    (agentDid: string): void => {
      connectTargetRef.current = agentDid;
      stopLogTransport();

      let pollingStarted = false;

      const startPolling = (): void => {
        if (pollingStarted) return;
        pollingStarted = true;
        stopLogTransport();
        void fetchLogsOnce(agentDid);
        pollRef.current = setInterval(() => {
          void fetchLogsOnce(agentDid);
        }, POLL_MS);
      };

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          pollingStarted = false;
        };

        ws.onmessage = (ev: MessageEvent<string>) => {
          if (connectTargetRef.current !== agentDid) return;
          try {
            const parsed: unknown = JSON.parse(ev.data as string);
            const batch = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of batch) {
              const log = normalizeAgentLog(item);
              if (log) mergeLogsForAgent(log.agentDid, [log]);
            }
          } catch (e) {
            console.error("[@iota-auth/sdk] WebSocket message parse error:", e);
          }
        };

        ws.onerror = () => {
          console.error("[@iota-auth/sdk] WebSocket error; falling back to polling");
          startPolling();
        };

        ws.onclose = (ev) => {
          if (connectTargetRef.current !== agentDid) return;
          if (!ev.wasClean && wsRef.current === ws) {
            console.error("[@iota-auth/sdk] WebSocket closed unexpectedly; falling back to polling");
            startPolling();
          }
        };
      } catch (e) {
        console.error("[@iota-auth/sdk] WebSocket constructor failed:", e);
        startPolling();
      }
    },
    [stopLogTransport, fetchLogsOnce, mergeLogsForAgent],
  );

  useEffect(() => {
    return () => {
      stopLogTransport();
    };
  }, [stopLogTransport]);

  const createAgent = useCallback(
    async (profile: string): Promise<void> => {
      if (!token) {
        console.error("[@iota-auth/sdk] createAgent: not authenticated");
        return;
      }
      try {
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/agent/create`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ permissionProfile: profile }),
        });
        if (!res.ok) {
          console.error("[@iota-auth/sdk] POST /agent/create failed:", res.status, await res.text());
          return;
        }
        await loadAgents();
      } catch (e) {
        console.error("[@iota-auth/sdk] POST /agent/create error:", e);
      }
    },
    [backendUrl, token, authHeaders, loadAgents],
  );

  return {
    agents,
    loading,
    createAgent,
    agentLogs,
    connectLogs,
  };
}
