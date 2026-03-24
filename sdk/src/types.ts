export type IotaAuthConfig = {
  backendUrl: string;
};

export type AuthProviderType = "google" | "github" | "wallet" | "telegram";

export type User = {
  providerId: string;
  providerType: AuthProviderType;
  email: string | null;
  name: string;
  picture: string | null;
  did: string;
  didDocument: unknown;
  walletAddress?: string;
};

export type AgentStatus = "created" | "pending_activation" | "active" | "revoked";

export type AgentTaskConfig = {
  shipmentId?: string;
  action?: string;
};

export type Agent = {
  agentDid: string;
  ownerDid: string;
  /** Nome visualizzato in dashboard. */
  name?: string;
  description?: string;
  permissionProfile: string;
  /** IOTA interi salvati alla creazione (profilo + custom). */
  permitMaxPerTxIota?: string;
  permitMaxPerDayIota?: string;
  /** Scadenza permit (ms Unix); "0" = mai. */
  permitExpiresAtMs?: string;
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
  taskType?: string;
  taskConfig?: AgentTaskConfig;
  permitObjectId?: string | null;
};

export type AgentLog = {
  agentDid: string;
  timestamp: string;
  type: string;
  data: unknown;
};
