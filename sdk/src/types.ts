export type AuthwardsConfig = {
  backendUrl: string;
};

/** @deprecated Use `AuthwardsConfig`. */
export type IotaAuthConfig = AuthwardsConfig;

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
  action?: string;
  /** Spend amount in nanos (when used with backend bridge). */
  amountNanos?: number;
  recipientAddress?: string;
};

export type Agent = {
  agentDid: string;
  ownerDid: string;
  /** Display name in the dashboard. */
  name?: string;
  description?: string;
  permissionProfile: string;
  /** Whole IOTA limits stored at creation (profile + custom). */
  permitMaxPerTxIota?: string;
  permitMaxPerDayIota?: string;
  /** Permit expiry (Unix ms); "0" = never. */
  permitExpiresAtMs?: string;
  createdAt: string;
  /** Legacy: prefer `status`. */
  active?: boolean;
  walletAddress?: string;
  status?: AgentStatus;
  activatedAt?: string | null;
  spentTodayNanos?: string;
  spentTodayDate?: string;
  /** Masked by the API (list view). */
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
