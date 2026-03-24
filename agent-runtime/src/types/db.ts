export type PermissionProfile = "readonly" | "custom" | "full_access" | "low_value";

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
  walletAddress?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  createdAt: string;
};

export type AgentTaskType = "balance_monitor" | "shipment_monitor";

export type AgentTaskConfig = {
  shipmentId: string;
  action: "release_payment";
};

export type DbAgent = {
  agentDid: string;
  ownerDid: string;
  ownerProviderId: string;
  ownerProviderType: AuthProviderType;
  permissionProfile: PermissionProfile;
  walletAddress?: string;
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
  createdAt: string;
  active: boolean;
  taskType?: AgentTaskType;
  taskConfig?: AgentTaskConfig;
};

export type DbShipment = {
  id: string;
  product: string;
  origin: string;
  destination: string;
  status: string;
  supplier: string;
  paymentAmount: number;
  createdAt: string;
};

/** Allineato al backend; `type`/`data` usati dal runtime; campi legacy opzionali. */
export type DbAgentLog = {
  agentDid: string;
  createdAt: string;
  message?: string;
  meta?: unknown;
  type?: string;
  data?: unknown;
};

export type DbShape = {
  users: DbUser[];
  agents: DbAgent[];
  agentLogs: DbAgentLog[];
  shipments: DbShipment[];
};
