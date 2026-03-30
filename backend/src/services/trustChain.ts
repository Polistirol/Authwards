import { IotaClient } from "@iota/iota-sdk/client";
import type { BalanceChange, IotaTransactionBlockResponse, ObjectOwner } from "@iota/iota-sdk/client";

import * as db from "./db.js";
import { getPermissionLimits, utcDateString } from "./agentPermissions.js";
import { resolveDid } from "./did.js";
import { getPermitInfo, type PermitInfo as OnChainPermitInfo } from "./permitContract.js";
import type { DbAgent } from "../types/db.js";

const DID_RESOLVE_MS = 5000;

export class DidNotResolvableError extends Error {
  readonly code = "did_not_found" as const;
  constructor(public readonly did: string) {
    super(`Could not resolve DID document for ${did}`);
    this.name = "DidNotResolvableError";
  }
}

export type TrustChainVerification = {
  delegateControlledByOwner: boolean;
  permitMatchesDids: boolean;
  permitIsActive: boolean;
  verified: boolean;
};

export type PermitInfoApi = {
  permitObjectId: string;
  maxPerTx: number;
  maxPerDay: number;
  spentToday: number;
  expiresAt: number;
  isActive: boolean;
  createdAt: number;
};

export type DelegateResolution = {
  delegateDid: string;
  delegateWallet: string;
  ownerDid: string | null;
  ownerWallet: string | null;
  controller: string;
  permit: PermitInfoApi | null;
  trustChain: TrustChainVerification;
};

export type DelegateInfoApi = {
  delegateDid: string;
  name: string | null;
  description: string | null;
  delegateType: string;
  walletAddress: string;
  permissionProfile: string;
  status: string;
  permitObjectId: string | null;
  permit: Partial<PermitInfoApi> | null;
};

export type OwnerDelegatesResolution = {
  ownerDid: string;
  delegates: DelegateInfoApi[];
};

export type TxResolution = {
  txHash: string;
  sender: string;
  senderDid: string | null;
  isDelegate: boolean;
  ownerDid: string | null;
  ownerWallet: string | null;
  amount: number | null;
  recipient: string | null;
  timestamp: string | null;
  permit: Partial<PermitInfoApi> | null;
  trustChain: { verified: boolean };
};

function effectiveAgentStatus(a: DbAgent): "created" | "active" | "revoked" {
  if (a.status === "pending_activation") return "created";
  if (a.status === "created" || a.status === "active" || a.status === "revoked") return a.status;
  if (a.status) return a.status;
  if (a.active === false) return "revoked";
  if (a.active === true) return "active";
  return "created";
}

function innerDoc(json: Record<string, unknown>): Record<string, unknown> {
  const d = json.doc;
  if (d && typeof d === "object") return d as Record<string, unknown>;
  return json;
}

function extractDocId(json: Record<string, unknown>): string | null {
  const inner = innerDoc(json);
  const id = inner.id;
  return typeof id === "string" ? id : null;
}

function extractController(json: Record<string, unknown>): string | null {
  const inner = innerDoc(json);
  const c = inner.controller;
  if (typeof c === "string") return c;
  if (Array.isArray(c) && c.length > 0 && typeof c[0] === "string") return c[0];
  return null;
}

async function resolveDidWithTimeout(did: string): Promise<
  | { timedOut: false; doc: Record<string, unknown> }
  | { timedOut: true; doc: null }
> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    const doc = await Promise.race([
      resolveDid(did),
      new Promise<"timeout">((resolve) => {
        t = setTimeout(() => resolve("timeout"), DID_RESOLVE_MS);
      }),
    ]);
    if (doc === "timeout") return { timedOut: true, doc: null };
    return { timedOut: false, doc: doc as Record<string, unknown> };
  } finally {
    if (t) clearTimeout(t);
  }
}

function onChainToApi(permitObjectId: string, p: OnChainPermitInfo): PermitInfoApi {
  return {
    permitObjectId,
    maxPerTx: Number(p.maxPerTx),
    maxPerDay: Number(p.maxPerDay),
    spentToday: Number(p.spentToday),
    expiresAt: Number(p.expiresAt),
    isActive: p.isActive,
    createdAt: Number(p.createdAt),
  };
}

function permitFromDbAgent(agent: DbAgent): PermitInfoApi {
  const limits = getPermissionLimits(agent);
  const today = utcDateString();
  let spent = BigInt(agent.spentTodayNanos ?? "0");
  if (agent.spentTodayDate !== today) spent = 0n;
  const exp = BigInt((agent.permitExpiresAtMs ?? "0").trim() || "0");
  const st = effectiveAgentStatus(agent);
  const active = st === "active";
  const now = Date.now();
  const expired = exp > 0n && exp < BigInt(now);
  return {
    permitObjectId: typeof agent.permitObjectId === "string" ? agent.permitObjectId : "",
    maxPerTx: Number(limits.maxPerTx),
    maxPerDay: Number(limits.maxPerDay),
    spentToday: Number(spent),
    expiresAt: exp === 0n ? 0 : Number(exp),
    isActive: active && !expired,
    createdAt: Number.isFinite(Date.parse(agent.createdAt)) ? Date.parse(agent.createdAt) : now,
  };
}

async function loadPermitForAgent(
  delegateDid: string,
  ownerDid: string | null,
  agentRow: DbAgent | undefined,
): Promise<{ permit: PermitInfoApi | null; permitMatchesDids: boolean; permitIsActive: boolean }> {
  let permit: PermitInfoApi | null = null;
  let permitMatchesDids = false;
  let permitIsActive = false;

  const expectedOwnerDid = ownerDid ?? agentRow?.ownerDid ?? null;

  const oid = agentRow?.permitObjectId?.trim();
  if (oid) {
    try {
      const onChain = await getPermitInfo(oid);
      if (onChain) {
        permit = onChainToApi(oid, onChain);
        permitMatchesDids =
          onChain.agentDid === delegateDid &&
          expectedOwnerDid !== null &&
          onChain.ownerDid === expectedOwnerDid;
        const now = Date.now();
        const exp = Number(onChain.expiresAt);
        const notExpired = exp === 0 || exp > now;
        permitIsActive = onChain.isActive && notExpired;
        return { permit, permitMatchesDids, permitIsActive };
      }
    } catch {
      /* fall through to db */
    }
  }

  if (agentRow && expectedOwnerDid && agentRow.ownerDid === expectedOwnerDid) {
    permit = permitFromDbAgent(agentRow);
    permitMatchesDids = true;
    const now = Date.now();
    const exp = permit.expiresAt;
    const notExpired = exp === 0 || exp > now;
    permitIsActive = permit.isActive && notExpired;
    return { permit, permitMatchesDids, permitIsActive };
  }

  return { permit: null, permitMatchesDids: false, permitIsActive: false };
}

export async function resolveDelegate(did: string): Promise<DelegateResolution> {
  const delegateDid = did.trim();
  if (!delegateDid.startsWith("did:")) {
    throw new DidNotResolvableError(delegateDid);
  }

  let docJson: Record<string, unknown> | null = null;
  let timedOut = false;

  try {
    const r = await resolveDidWithTimeout(delegateDid);
    timedOut = r.timedOut;
    docJson = r.doc;
  } catch {
    throw new DidNotResolvableError(delegateDid);
  }

  const agentRow = await db.findAgentByDid(delegateDid);
  const delegateWallet = agentRow?.walletAddress?.trim() ?? "";

  if (timedOut && !agentRow) {
    return {
      delegateDid,
      delegateWallet: delegateWallet || "",
      ownerDid: null,
      ownerWallet: null,
      controller: delegateDid,
      permit: null,
      trustChain: {
        delegateControlledByOwner: false,
        permitMatchesDids: false,
        permitIsActive: false,
        verified: false,
      },
    };
  }

  const docId = docJson ? extractDocId(docJson) : null;
  const controllerFromDoc = docJson ? extractController(docJson) : null;
  const canonicalDocId = docId ?? delegateDid;

  const isDelegateByDid =
    Boolean(docJson) &&
    !timedOut &&
    Boolean(controllerFromDoc) &&
    Boolean(docId) &&
    controllerFromDoc !== docId;

  let ownerDid: string | null = null;
  let delegateControlledByOwner = false;

  if (isDelegateByDid && controllerFromDoc) {
    ownerDid = controllerFromDoc;
    delegateControlledByOwner = true;
  } else if (timedOut && agentRow) {
    ownerDid = agentRow.ownerDid;
    delegateControlledByOwner = false;
  }

  const controller =
    ownerDid ?? (canonicalDocId || delegateDid);

  if (!ownerDid) {
    const { permit, permitMatchesDids, permitIsActive } = await loadPermitForAgent(
      delegateDid,
      null,
      agentRow,
    );
    return {
      delegateDid,
      delegateWallet,
      ownerDid: null,
      ownerWallet: null,
      controller: canonicalDocId,
      permit,
      trustChain: {
        delegateControlledByOwner: false,
        permitMatchesDids,
        permitIsActive,
        verified: false,
      },
    };
  }

  const ownerUser = await db.findUserByDid(ownerDid);
  const ownerWallet = ownerUser?.walletAddress?.trim() ?? null;

  const { permit, permitMatchesDids, permitIsActive } = await loadPermitForAgent(
    delegateDid,
    ownerDid,
    agentRow,
  );

  const verified = delegateControlledByOwner && permitMatchesDids && permitIsActive;

  return {
    delegateDid,
    delegateWallet,
    ownerDid,
    ownerWallet,
    controller,
    permit,
    trustChain: {
      delegateControlledByOwner,
      permitMatchesDids,
      permitIsActive,
      verified,
    },
  };
}

export async function resolveOwnerDelegates(ownerDid: string): Promise<OwnerDelegatesResolution> {
  const agents = await db.findAgentsByOwnerDid(ownerDid.trim());
  const delegates: DelegateInfoApi[] = [];

  for (const a of agents) {
    let permitPartial: Partial<PermitInfoApi> | null = null;
    const oid = a.permitObjectId?.trim();
    if (oid) {
      try {
        const onChain = await getPermitInfo(oid);
        if (onChain) {
          const full = onChainToApi(oid, onChain);
          permitPartial = {
            maxPerTx: full.maxPerTx,
            maxPerDay: full.maxPerDay,
            spentToday: full.spentToday,
            isActive: full.isActive,
            expiresAt: full.expiresAt,
            createdAt: full.createdAt,
            permitObjectId: full.permitObjectId,
          };
        }
      } catch {
        /* ignore */
      }
    }
    if (!permitPartial) {
      const fb = permitFromDbAgent(a);
      permitPartial = {
        maxPerTx: fb.maxPerTx,
        maxPerDay: fb.maxPerDay,
        spentToday: fb.spentToday,
        isActive: fb.isActive,
      };
    }

    delegates.push({
      delegateDid: a.agentDid,
      name: a.name ?? null,
      description: a.description ?? null,
      delegateType: a.taskType ?? "agent",
      walletAddress: a.walletAddress ?? "",
      permissionProfile: a.permissionProfile,
      status: effectiveAgentStatus(a),
      permitObjectId: a.permitObjectId ?? null,
      permit: permitPartial,
    });
  }

  return { ownerDid: ownerDid.trim(), delegates };
}

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL not set");
  return url;
}

function normAddr(a: string): string {
  return a.trim().toLowerCase();
}

function ownerToAddress(owner: ObjectOwner): string | null {
  if (owner && typeof owner === "object" && "AddressOwner" in owner) {
    return (owner as { AddressOwner: string }).AddressOwner;
  }
  return null;
}

function isNativeIotaCoin(coinType: string): boolean {
  return /::iota::IOTA$/i.test(coinType);
}

function sumSenderIotaDelta(changes: BalanceChange[] | null | undefined, senderNorm: string): bigint {
  if (!changes?.length) return 0n;
  let sum = 0n;
  for (const c of changes) {
    if (!isNativeIotaCoin(c.coinType)) continue;
    const oa = ownerToAddress(c.owner);
    if (!oa || normAddr(oa) !== senderNorm) continue;
    sum += BigInt(c.amount);
  }
  return sum;
}

function pickRecipientFromBalanceChanges(
  tx: IotaTransactionBlockResponse,
  senderNorm: string,
  changes: BalanceChange[] | null | undefined,
): string | null {
  const list = changes ?? [];
  const myDelta = sumSenderIotaDelta(list, senderNorm);
  if (myDelta >= 0n) {
    for (const c of list) {
      if (!isNativeIotaCoin(c.coinType)) continue;
      const oa = ownerToAddress(c.owner);
      if (!oa || normAddr(oa) === senderNorm) continue;
      if (BigInt(c.amount) > 0n) return oa;
    }
    return null;
  }
  for (const c of list) {
    if (!isNativeIotaCoin(c.coinType)) continue;
    const oa = ownerToAddress(c.owner);
    if (!oa || normAddr(oa) === senderNorm) continue;
    if (BigInt(c.amount) > 0n) return oa;
  }
  return null;
}

export async function resolveTransaction(txHash: string): Promise<TxResolution> {
  const digest = txHash.trim();
  const client = new IotaClient({ url: getNodeUrl() });
  let block: IotaTransactionBlockResponse;
  try {
    block = await client.getTransactionBlock({
      digest,
      options: {
        showInput: true,
        showEffects: true,
        showBalanceChanges: true,
      },
    });
  } catch {
    return {
      txHash: digest,
      sender: "",
      senderDid: null,
      isDelegate: false,
      ownerDid: null,
      ownerWallet: null,
      amount: null,
      recipient: null,
      timestamp: null,
      permit: null,
      trustChain: { verified: false },
    };
  }

  const sender = block.transaction?.data?.sender?.trim() ?? "";
  if (!sender) {
    const ts = block.timestampMs ? new Date(Number(block.timestampMs)).toISOString() : null;
    return {
      txHash: digest,
      sender: "",
      senderDid: null,
      isDelegate: false,
      ownerDid: null,
      ownerWallet: null,
      amount: null,
      recipient: null,
      timestamp: ts,
      permit: null,
      trustChain: { verified: false },
    };
  }

  const senderNorm = normAddr(sender);
  const delta = sumSenderIotaDelta(block.balanceChanges, senderNorm);
  const amountNanos = delta < 0n ? -delta : null;
  const amount = amountNanos !== null ? Number(amountNanos) : null;
  const recipient = pickRecipientFromBalanceChanges(block, senderNorm, block.balanceChanges);

  const tsMs = block.timestampMs ? Number(block.timestampMs) : NaN;
  const timestamp = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null;

  const agent = await db.findAgentByWalletAddress(sender);
  const user = await db.findUserByWalletAddress(sender);

  if (!agent && user) {
    return {
      txHash: digest,
      sender,
      senderDid: user.did,
      isDelegate: false,
      ownerDid: null,
      ownerWallet: null,
      amount,
      recipient,
      timestamp,
      permit: null,
      trustChain: { verified: false },
    };
  }

  if (!agent) {
    return {
      txHash: digest,
      sender,
      senderDid: null,
      isDelegate: false,
      ownerDid: null,
      ownerWallet: null,
      amount,
      recipient,
      timestamp,
      permit: null,
      trustChain: { verified: false },
    };
  }

  let delegateRes: DelegateResolution;
  try {
    delegateRes = await resolveDelegate(agent.agentDid);
  } catch {
    return {
      txHash: digest,
      sender,
      senderDid: agent.agentDid,
      isDelegate: true,
      ownerDid: agent.ownerDid,
      ownerWallet: null,
      amount,
      recipient,
      timestamp,
      permit: null,
      trustChain: { verified: false },
    };
  }

  const permitOut: Partial<PermitInfoApi> | null = delegateRes.permit
    ? {
        permitObjectId: delegateRes.permit.permitObjectId,
        maxPerTx: delegateRes.permit.maxPerTx,
        maxPerDay: delegateRes.permit.maxPerDay,
        spentToday: delegateRes.permit.spentToday,
        isActive: delegateRes.permit.isActive,
        expiresAt: delegateRes.permit.expiresAt,
      }
    : null;

  const ownerWallet =
    delegateRes.ownerWallet ??
    (await db.findUserByDid(agent.ownerDid))?.walletAddress ??
    null;

  return {
    txHash: digest,
    sender,
    senderDid: agent.agentDid,
    isDelegate: true,
    ownerDid: delegateRes.ownerDid,
    ownerWallet,
    amount,
    recipient,
    timestamp,
    permit: permitOut,
    trustChain: { verified: delegateRes.trustChain.verified },
  };
}
