export type PermissionProfile = "readonly" | "custom" | "full_access" | "low_value";

export type AgentStatus = "created" | "active" | "revoked" | "pending_activation";

export type AuthProviderType = "google" | "github" | "wallet" | "telegram";

export type DbUser = {
  providerId: string;
  providerType: AuthProviderType;
  email: string | null;
  name: string;
  picture: string | null;
  did: string;
  didDocument: Record<string, unknown>;
  DIDCreationTx?: string;
  didGasMode?: "master_payer" | "sponsored";
  airdropTxHash?: string;
  walletAddress?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  nextAgentIndex?: number;
  createdAt: string;
};

export type AgentTaskType = "balance_monitor";

export type AgentTaskConfig = {
  action?: "release_payment";
  recipientAddress?: string;
  amountNanos?: number;
};

export type DbAgent = {
  agentDid: string;
  name?: string;
  description?: string;
  ownerDid: string;
  ownerProviderId: string;
  ownerProviderType: AuthProviderType;
  permissionProfile: PermissionProfile;
  permitMaxPerTxIota?: string;
  permitMaxPerDayIota?: string;
  permitExpiresAtMs?: string;
  walletAddress?: string;
  DIDCreationTx?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  agentToken?: string;
  agentIndex?: number;
  permitObjectId?: string | null;
  status?: AgentStatus;
  activatedAt?: string | null;
  spentTodayNanos?: string;
  spentTodayDate?: string;
  createdAt: string;
  active?: boolean;
  taskType?: AgentTaskType;
  taskConfig?: AgentTaskConfig;
};

export type DbAgentLog = {
  agentDid: string;
  createdAt: string;
  message?: string;
  type?: string;
  data?: unknown;
  meta?: unknown;
};

export type DbShape = {
  users: DbUser[];
  agents: DbAgent[];
  agentLogs: DbAgentLog[];
};
