export type PermissionProfile = "readonly" | "low_value" | "full_access";

export type DbUser = {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  did: string;
  didDocument: Record<string, unknown>;
  /** Digest della transaction block on-chain di `createIdentity` (IOTA). Assente per utenti creati prima di questo campo. */
  DIDCreationTx?: string;
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
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
  createdAt: string;
  active: boolean;
  taskType?: AgentTaskType;
  taskConfig?: AgentTaskConfig;
};

export type DbAgentLog = {
  agentDid: string;
  createdAt: string;
  message: string;
  meta?: unknown;
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

export type DbShape = {
  users: DbUser[];
  agents: DbAgent[];
  agentLogs: DbAgentLog[];
  shipments: DbShipment[];
};
