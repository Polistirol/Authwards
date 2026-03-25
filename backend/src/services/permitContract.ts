import { IotaClient } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";

import { getMasterKeypair } from "./masterWallet.js";
import type { PermissionProfile } from "../types/db.js";

const NANOS_PER_IOTA = 1_000_000_000n;

/** Error codes from `iota_auth::agent_permit` (must match deployed Move). */
export const PERMIT_ABORT = {
  E_NOT_AUTHORIZED: 0,
  E_PERMIT_EXPIRED: 1,
  E_PERMIT_INACTIVE: 2,
  E_EXCEEDS_TX_LIMIT: 3,
  E_EXCEEDS_DAILY_LIMIT: 4,
  E_NOT_OWNER: 5,
} as const;

const TX_OPTS = {
  showEffects: true,
  showEvents: true,
} as const;

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL not set");
  return url;
}

export function getAgentPermitPackageId(): string | null {
  const id = process.env.AGENT_PERMIT_PACKAGE_ID?.trim();
  return id || null;
}

export function isPermitContractConfigured(): boolean {
  return Boolean(getAgentPermitPackageId());
}

/** On-chain limits in whole IOTA (converted to nanos in `create_permit`). */
export function permissionProfileToOnChainIotaLimits(profile: PermissionProfile): {
  maxPerTxIota: bigint;
  maxPerDayIota: bigint;
} {
  switch (profile) {
    case "readonly":
      return { maxPerTxIota: 0n, maxPerDayIota: 0n };
    case "custom":
      return { maxPerTxIota: 0n, maxPerDayIota: 0n };
    case "low_value":
      return { maxPerTxIota: 5n, maxPerDayIota: 20n };
    case "full_access":
      return { maxPerTxIota: 1000n, maxPerDayIota: 10000n };
    default:
      return { maxPerTxIota: 0n, maxPerDayIota: 0n };
  }
}

function iotaWholeToNanos(iota: bigint): bigint {
  return iota * NANOS_PER_IOTA;
}

function utf8Bytes(s: string): number[] {
  return [...Buffer.from(s, "utf8")];
}

function parseAbortCodeFromExecutionError(err: string | undefined): number | null {
  if (!err) return null;
  // Example RPC: "... MoveAbort ... in command 0, MoveAbort ... code: 2" etc.
  const m = /code[:\s]+(\d+)/i.exec(err);
  if (m) return parseInt(m[1], 10);
  const m2 = /abort[^0-9]*(\d+)/i.exec(err);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

function abortCodeToMessage(code: number): string {
  switch (code) {
    case PERMIT_ABORT.E_PERMIT_EXPIRED:
      return "permit_expired";
    case PERMIT_ABORT.E_PERMIT_INACTIVE:
      return "permit_inactive";
    case PERMIT_ABORT.E_EXCEEDS_TX_LIMIT:
      return "tx_limit";
    case PERMIT_ABORT.E_EXCEEDS_DAILY_LIMIT:
      return "daily_limit";
    case PERMIT_ABORT.E_NOT_OWNER:
      return "permit_not_owner";
    case PERMIT_ABORT.E_NOT_AUTHORIZED:
      return "permit_not_authorized";
    default:
      return `permit_abort_${code}`;
  }
}

function extractPermitIdFromEvents(
  packageId: string,
  events: { type: string; parsedJson?: unknown }[] | null | undefined,
): string | null {
  const want = `${packageId}::agent_permit::PermitCreated`;
  for (const ev of events ?? []) {
    if (ev.type !== want) continue;
    const j = ev.parsedJson as { permit_id?: string } | null | undefined;
    if (j?.permit_id && typeof j.permit_id === "string") return j.permit_id;
  }
  return null;
}

export type CreatePermitParams = {
  agentDid: string;
  ownerDid: string;
  maxPerTx: bigint;
  maxPerDay: bigint;
  expiresAtMs: bigint;
};

export async function createPermitOnChain(params: CreatePermitParams): Promise<{
  permitObjectId: string;
  txHash: string;
}> {
  const packageId = getAgentPermitPackageId();
  if (!packageId) throw new Error("AGENT_PERMIT_PACKAGE_ID not set");

  const client = new IotaClient({ url: getNodeUrl() });
  const signer = getMasterKeypair();
  const tx = new Transaction();
  tx.setGasBudgetIfNotSet(50_000_000n);
  tx.moveCall({
    target: `${packageId}::agent_permit::create_permit`,
    arguments: [
      tx.pure.vector("u8", utf8Bytes(params.agentDid)),
      tx.pure.vector("u8", utf8Bytes(params.ownerDid)),
      tx.pure.u64(iotaWholeToNanos(params.maxPerTx)),
      tx.pure.u64(iotaWholeToNanos(params.maxPerDay)),
      tx.pure.u64(params.expiresAtMs),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: TX_OPTS,
  });

  const digest = result.digest;
  const status = result.effects?.status?.status;
  if (status !== "success") {
    const err = result.effects?.status?.error ?? "create_permit failed";
    throw new Error(err);
  }

  const permitObjectId = extractPermitIdFromEvents(packageId, result.events ?? null);
  if (!permitObjectId) {
    throw new Error("PermitCreated event not found in transaction response");
  }

  return { permitObjectId, txHash: digest };
}

export type AuthorizeSpendResult =
  | { success: true; txHash: string }
  | { success: false; error: string; txHash?: string; networkError?: boolean };

/** `amountNanos` as in the contract (same unit as the agent transaction). */
export async function authorizeSpendOnChain(
  permitObjectId: string,
  amountNanos: bigint,
): Promise<AuthorizeSpendResult> {
  const packageId = getAgentPermitPackageId();
  if (!packageId) {
    return { success: false, error: "permit_package_missing" };
  }

  try {
    const client = new IotaClient({ url: getNodeUrl() });
    const signer = getMasterKeypair();
    const tx = new Transaction();
    tx.setGasBudgetIfNotSet(50_000_000n);
    tx.moveCall({
      target: `${packageId}::agent_permit::authorize_spend`,
      arguments: [tx.object(permitObjectId), tx.pure.u64(amountNanos), tx.object.clock()],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: TX_OPTS,
    });

    const st = result.effects?.status;
    if (st?.status === "success") {
      return { success: true, txHash: result.digest };
    }

    const raw = st?.error ?? "authorize_spend failed";
    const code = parseAbortCodeFromExecutionError(raw);
    const msg = code !== null ? abortCodeToMessage(code) : raw;
    return { success: false, error: msg, txHash: result.digest };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.warn("[permitContract] authorizeSpendOnChain network/SDK error:", raw);
    return { success: false, error: raw, networkError: true };
  }
}

export async function reactivatePermitOnChain(permitObjectId: string): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const packageId = getAgentPermitPackageId();
  if (!packageId) {
    return { success: false, error: "AGENT_PERMIT_PACKAGE_ID not set" };
  }

  try {
    const client = new IotaClient({ url: getNodeUrl() });
    const signer = getMasterKeypair();
    const tx = new Transaction();
    tx.setGasBudgetIfNotSet(50_000_000n);
    tx.moveCall({
      target: `${packageId}::agent_permit::reactivate_permit`,
      arguments: [tx.object(permitObjectId)],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: TX_OPTS,
    });

    const st = result.effects?.status;
    if (st?.status === "success") {
      return { success: true, txHash: result.digest };
    }
    return {
      success: false,
      txHash: result.digest,
      error: st?.error ?? "reactivate_permit failed",
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { success: false, error: raw };
  }
}

export async function revokePermitOnChain(permitObjectId: string): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const packageId = getAgentPermitPackageId();
  if (!packageId) {
    return { success: false, error: "AGENT_PERMIT_PACKAGE_ID not set" };
  }

  try {
    const client = new IotaClient({ url: getNodeUrl() });
    const signer = getMasterKeypair();
    const tx = new Transaction();
    tx.setGasBudgetIfNotSet(50_000_000n);
    tx.moveCall({
      target: `${packageId}::agent_permit::revoke_permit`,
      arguments: [tx.object(permitObjectId)],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: TX_OPTS,
    });

    const st = result.effects?.status;
    if (st?.status === "success") {
      return { success: true, txHash: result.digest };
    }
    return {
      success: false,
      txHash: result.digest,
      error: st?.error ?? "revoke_permit failed",
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { success: false, error: raw };
  }
}

function getMoveStructFields(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object") return null;
  const o = content as Record<string, unknown>;
  if (o.dataType === "moveObject" && o.fields && typeof o.fields === "object") {
    const f = o.fields as Record<string, unknown>;
    if ("fields" in f && typeof f.fields === "object" && f.fields !== null) {
      return f.fields as Record<string, unknown>;
    }
    return f;
  }
  return null;
}

function decodeMoveVectorU8(v: unknown): string {
  if (typeof v === "string") {
    try {
      return Buffer.from(v, "base64").toString("utf8");
    } catch {
      return v;
    }
  }
  if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
    return Buffer.from(v).toString("utf8");
  }
  return "";
}

function u64Field(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string") return BigInt(v);
  return 0n;
}

export type PermitInfo = {
  agentDid: string;
  ownerDid: string;
  maxPerTx: string;
  maxPerDay: string;
  spentToday: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
};

export async function getPermitInfo(permitObjectId: string): Promise<PermitInfo | null> {
  const client = new IotaClient({ url: getNodeUrl() });
  const res = await client.getObject({
    id: permitObjectId,
    options: { showContent: true, showType: true },
  });

  const data = res.data;
  if (!data?.content || data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = getMoveStructFields(data.content);
  if (!fields) return null;

  const agentDid = decodeMoveVectorU8(fields.agent_did);
  const ownerDid = decodeMoveVectorU8(fields.owner_did);
  const maxPerTx = u64Field(fields.max_per_tx);
  const maxPerDay = u64Field(fields.max_per_day);
  const spentToday = u64Field(fields.spent_today);
  const expiresAt = u64Field(fields.expires_at);
  const createdAt = u64Field(fields.created_at);
  const isActive = Boolean(fields.is_active);

  return {
    agentDid,
    ownerDid,
    maxPerTx: maxPerTx.toString(),
    maxPerDay: maxPerDay.toString(),
    spentToday: spentToday.toString(),
    expiresAt: expiresAt.toString(),
    isActive,
    createdAt: createdAt.toString(),
  };
}

export function permitExplorerUrl(permitObjectId: string): string {
  return `https://explorer.iota.org/object/${permitObjectId}`;
}
