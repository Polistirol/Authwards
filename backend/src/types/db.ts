export type PermissionProfile = "readonly" | "custom" | "full_access" | "low_value";

/** `pending_activation` è legacy (trattato come `created`). */
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
  /** Digest della transaction block on-chain di `createIdentity` (IOTA). Assente per utenti creati prima di questo campo. */
  DIDCreationTx?: string;
  /** Come è stato pagato il gas alla creazione (master firma la tx; VM = chiave utente). */
  didGasMode?: "master_payer" | "sponsored";
  /** Tx digest dell’airdrop di benvenuto (se inviato). */
  airdropTxHash?: string;
  /** Indirizzo IOTA (sender on-chain) derivato dalla stessa keypair del DID. */
  walletAddress?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  /** Prossimo indice per derivazione HKDF degli agenti (0-based). */
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
  /** Nome scelto dall'utente in dashboard. */
  name?: string;
  /** Descrizione opzionale mostrata in elenco. */
  description?: string;
  ownerDid: string;
  ownerProviderId: string;
  ownerProviderType: AuthProviderType;
  permissionProfile: PermissionProfile;
  /** Limiti effettivi in IOTA interi (stringa decimale intera). Impostati alla creazione; usati per db fallback e permit on-chain. */
  permitMaxPerTxIota?: string;
  permitMaxPerDayIota?: string;
  /** Scadenza permit (ms Unix). "0" = senza scadenza. */
  permitExpiresAtMs?: string;
  /** Indirizzo IOTA derivato dalla chiave Ed25519 dell’agente (VM #key-1). */
  walletAddress?: string;
  DIDCreationTx?: string;
  /** Legacy: agenti creati prima del bridge (chiave cifrata). */
  encryptedPrivateKey?: string;
  iv?: string;
  salt?: string;
  /** Bridge: token per Authorization Bearer. */
  agentToken?: string;
  /** Indice usato in HKDF (derivazione deterministica). */
  agentIndex?: number;
  permitObjectId?: string | null;
  status?: AgentStatus;
  activatedAt?: string | null;
  /** Budget giornaliero (nanos), reset per data UTC. */
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
