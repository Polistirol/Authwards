export type PermissionProfile = "readonly" | "custom" | "full_access" | "low_value";

/** `pending_activation` is legacy (treated as `created`). */
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
  /** On-chain transaction block digest for `createIdentity` (IOTA). Missing for users created before this field existed. */
  DIDCreationTx?: string;
  /** How gas was paid at creation (master signs the tx; VM = user key). */
  didGasMode?: "master_payer" | "sponsored";
  /** Welcome airdrop tx digest (if sent). */
  airdropTxHash?: string;
  /** IOTA address (on-chain sender) derived from the same keypair as the DID. */
  walletAddress?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  /** Next index for HKDF agent derivation (0-based). */
  nextAgentIndex?: number;
  createdAt: string;
};

export type AgentTaskType = "balance_monitor" | "shipment_monitor";

export type AgentTaskConfig = {
  shipmentId: string;
  action: "release_payment";
  recipientAddress?: string;
  amountNanos?: number;
};

export type DbAgent = {
  agentDid: string;
  /** Name chosen by the user in the dashboard. */
  name?: string;
  /** Optional description shown in the list. */
  description?: string;
  ownerDid: string;
  ownerProviderId: string;
  ownerProviderType: AuthProviderType;
  permissionProfile: PermissionProfile;
  /** Effective limits in whole IOTA (decimal integer string). Set at creation; used for DB fallback and on-chain permit. */
  permitMaxPerTxIota?: string;
  permitMaxPerDayIota?: string;
  /** Permit expiry (Unix ms). "0" = no expiry. */
  permitExpiresAtMs?: string;
  /** IOTA address derived from the agent Ed25519 key (VM #key-1). */
  walletAddress?: string;
  DIDCreationTx?: string;
  /** Legacy: agents created before the bridge (encrypted key). */
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  /** Bridge: token for Authorization Bearer. */
  agentToken?: string;
  /** Index used in HKDF (deterministic derivation). */
  agentIndex?: number;
  permitObjectId?: string | null;
  status?: AgentStatus;
  activatedAt?: string | null;
  /** Daily budget (nanos), reset by UTC date. */
  spentTodayNanos?: string;
  spentTodayDate?: string;
  createdAt: string;
  /** Legacy: usare `status`. */
  active?: boolean;
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
