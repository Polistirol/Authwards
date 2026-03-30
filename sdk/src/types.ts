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
  /** Explorer URL for the on-chain permit object (when returned by the API). */
  permitExplorerUrl?: string | null;
};

export type AgentLog = {
  agentDid: string;
  timestamp: string;
  type: string;
  data: unknown;
};

/** Public trust-chain resolution (`GET /resolve/*`). Amounts in permit mirror on-chain nanos. */
export interface DelegateResolution {
  delegateDid: string;
  delegateWallet: string;
  ownerDid: string | null;
  ownerWallet: string | null;
  controller: string;
  permit: PermitInfo | null;
  trustChain: TrustChainVerification;
}

export interface PermitInfo {
  permitObjectId: string;
  maxPerTx: number;
  maxPerDay: number;
  spentToday: number;
  expiresAt: number;
  isActive: boolean;
  createdAt: number;
}

export interface TrustChainVerification {
  delegateControlledByOwner: boolean;
  permitMatchesDids: boolean;
  permitIsActive: boolean;
  verified: boolean;
}

export interface OwnerDelegatesResolution {
  ownerDid: string;
  delegates: DelegateInfo[];
}

export interface DelegateInfo {
  delegateDid: string;
  name: string | null;
  description: string | null;
  delegateType: string;
  walletAddress: string;
  permissionProfile: string;
  status: string;
  permitObjectId: string | null;
  permit: Partial<PermitInfo> | null;
}

export interface TxResolution {
  txHash: string;
  sender: string;
  senderDid: string | null;
  isDelegate: boolean;
  ownerDid: string | null;
  ownerWallet: string | null;
  amount: number | null;
  recipient: string | null;
  timestamp: string | null;
  permit: Partial<PermitInfo> | null;
  trustChain: { verified: boolean };
}
