export type PermissionProfile = "readonly" | "low_value" | "full_access";

export type DbUser = {
  googleId: string;
  email: string;
  name: string;
  picture: string;
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
  ownerGoogleId: string;
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
