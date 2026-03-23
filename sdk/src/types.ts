export type IotaAuthConfig = {
  backendUrl: string;
};

export type User = {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  did: string;
  didDocument: unknown;
  walletAddress?: string;
};

export type AgentStatus = "pending_activation" | "active" | "revoked";

export type Agent = {
  agentDid: string;
  ownerDid: string;
  /** Nome visualizzato in dashboard. */
  name?: string;
  description?: string;
  permissionProfile: string;
  createdAt: string;
  /** Legacy: preferire `status`. */
  active?: boolean;
  walletAddress?: string;
  status?: AgentStatus;
  activatedAt?: string | null;
  spentTodayNanos?: string;
  spentTodayDate?: string;
  /** Mascherato lato API (lista). */
  agentToken?: string;
};

export type AgentLog = {
  agentDid: string;
  timestamp: string;
  type: string;
  data: unknown;
};
