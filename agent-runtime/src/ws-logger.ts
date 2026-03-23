import { WebSocketServer } from "ws";

export type AgentLogType =
  | "start"
  | "check"
  | "trigger"
  | "tx_success"
  | "tx_fail"
  | "permission_denied"
  | "error";

export type AgentLogMessage = {
  agentDid: string;
  timestamp: string;
  type: AgentLogType;
  data: unknown;
};

export function createWsLogger(port: number): {
  broadcast: (message: AgentLogMessage) => void;
  close: () => void;
} {
  const wss = new WebSocketServer({ port });

  wss.on("connection", () => {
    console.log("[ws] Dashboard connected");
  });

  return {
    broadcast(message: AgentLogMessage): void {
      const payload = JSON.stringify(message);
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(payload);
      }
    },
    close(): void {
      wss.close();
    },
  };
}
